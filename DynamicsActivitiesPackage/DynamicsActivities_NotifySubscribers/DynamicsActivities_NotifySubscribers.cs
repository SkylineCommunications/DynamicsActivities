namespace DynamicsActivitiesNotifySubscribers
{
	using System;
	using System.Collections.Generic;
	using System.Linq;
	using System.Text;
	using DynamicsActivities.DomDefinitions;
	using Newtonsoft.Json;
	using Skyline.DataMiner.Automation;
	using Skyline.DataMiner.Net.Apps.DataMinerObjectModel;
	using Skyline.DataMiner.Net.Messages.SLDataGateway;
	using Skyline.DataMiner.Net.Sections;

	/// <summary>
	/// Scheduled notification script for Activity Subscriptions.
	/// Runs on a timer (e.g. every 15 minutes) and sends email digests
	/// to subscribers whose frequency interval has elapsed.
	/// Parameter: Frequency (instant|daily|weekly|monthly) — filters which subs to process.
	/// </summary>
	public class Script
	{
		private DomHelper domHelper;

		/// <summary>
		/// The script entry point.
		/// </summary>
		/// <param name="engine">Link with SLAutomation process.</param>
		public void Run(IEngine engine)
		{
			try
			{
				RunSafe(engine);
			}
			catch (ScriptAbortException)
			{
				throw;
			}
			catch (ScriptForceAbortException)
			{
				throw;
			}
			catch (ScriptTimeoutException)
			{
				throw;
			}
			catch (Exception e)
			{
				engine.ExitFail("Run|Something went wrong: " + e);
			}
		}

		private void RunSafe(IEngine engine)
		{
			domHelper = new DomHelper(engine.SendSLNetMessages, DomIds.ModuleId);

			var frequency = engine.GetScriptParam("Frequency")?.Value?.Trim().ToLowerInvariant() ?? "daily";
			var now = DateTime.UtcNow;

			// Get all enabled subscriptions matching the requested frequency
			var enabledFilter = DomInstanceExposers.FieldValues.DomInstanceField(
				new FieldDescriptorID(DomIds.Subscription.Enabled)).Equal(true);
			var frequencyFilter = DomInstanceExposers.FieldValues.DomInstanceField(
				new FieldDescriptorID(DomIds.Subscription.Frequency)).Equal(frequency);

			var allInstances = domHelper.DomInstances.Read(enabledFilter.AND(frequencyFilter));
			engine.GenerateInformation($"[NotifySubscribers] Found {allInstances.Count} enabled '{frequency}' subscription(s).");

			int emailsSent = 0;

			foreach (var instance in allInstances)
			{
				var section = instance.Sections.FirstOrDefault();
				if (section == null) continue;

				var userEmail = GetField<string>(section, DomIds.Subscription.UserEmail);
				var userName = GetField<string>(section, DomIds.Subscription.UserName);
				var scopeType = GetField<string>(section, DomIds.Subscription.ScopeType);
				var scopeValue = GetField<string>(section, DomIds.Subscription.ScopeValue);
				var scopeLabel = GetField<string>(section, DomIds.Subscription.ScopeLabel);
				var activityTypesJson = GetField<string>(section, DomIds.Subscription.ActivityTypes);
				var lastSentAtStr = GetField<string>(section, DomIds.Subscription.LastSentAt);

				if (string.IsNullOrEmpty(userEmail)) continue;

				var lastSentAt = ParseDateTime(lastSentAtStr) ?? DateTime.MinValue;

				// Skip if not enough time has elapsed since last send
				if (!ShouldSend(frequency, lastSentAt, now)) continue;

				// Build notification email
				var subject = $"[DynamicsActivities] Activity digest for {scopeLabel ?? scopeValue}";
				var body = BuildEmailBody(userName, scopeType, scopeValue, scopeLabel, activityTypesJson, lastSentAt, now);

				try
				{
					engine.SendEmail(body, subject, userEmail);
					emailsSent++;

					// Update lastSentAt
					section.AddOrReplaceFieldValue(new FieldValue(
						new FieldDescriptorID(DomIds.Subscription.LastSentAt),
						new ValueWrapper<string>(now.ToString("o"))));
					domHelper.DomInstances.Update(instance);
				}
				catch (Exception ex)
				{
					engine.GenerateInformation($"[NotifySubscribers] Failed to email {userEmail}: {ex.Message}");
				}
			}

			engine.GenerateInformation($"[NotifySubscribers] Done. Sent {emailsSent} email(s).");
		}

		private static bool ShouldSend(string frequency, DateTime lastSent, DateTime now)
		{
			switch (frequency)
			{
				case "instant":
					return true; // Always send
				case "daily":
					return (now - lastSent).TotalHours >= 23;
				case "weekly":
					return (now - lastSent).TotalDays >= 6.5;
				case "monthly":
					return (now - lastSent).TotalDays >= 28;
				default:
					return (now - lastSent).TotalHours >= 23;
			}
		}

		private static string BuildEmailBody(
			string userName, string scopeType, string scopeValue,
			string scopeLabel, string activityTypesJson, DateTime since, DateTime until)
		{
			var activityTypes = ParseActivityTypes(activityTypesJson);
			var sb = new StringBuilder();
			sb.AppendLine($"<html><body>");
			sb.AppendLine($"<h2>Activity Digest for {userName ?? "Subscriber"}</h2>");
			sb.AppendLine($"<p><strong>Scope:</strong> {scopeType} — {scopeLabel ?? scopeValue}</p>");
			sb.AppendLine($"<p><strong>Period:</strong> {since:yyyy-MM-dd HH:mm} UTC → {until:yyyy-MM-dd HH:mm} UTC</p>");

			if (activityTypes != null && activityTypes.Count > 0)
			{
				sb.AppendLine($"<p><strong>Activity types:</strong> {string.Join(", ", activityTypes)}</p>");
			}
			else
			{
				sb.AppendLine($"<p><strong>Activity types:</strong> All</p>");
			}

			sb.AppendLine("<hr/>");
			sb.AppendLine("<p><em>Note: This is a notification that new activities matching your subscription exist. ");
			sb.AppendLine("Please check the DynamicsActivities app for details.</em></p>");
			sb.AppendLine("</body></html>");
			return sb.ToString();
		}

		private static T GetField<T>(Section section, Guid fieldId)
		{
			var fv = section.FieldValues.FirstOrDefault(f => f.FieldDescriptorID.Id == fieldId);
			if (fv?.Value?.Value is T typed) return typed;
			return default;
		}

		private static DateTime? ParseDateTime(string iso)
		{
			if (string.IsNullOrEmpty(iso)) return null;
			if (DateTime.TryParse(iso, null, System.Globalization.DateTimeStyles.RoundtripKind, out var dt))
				return dt;
			return null;
		}

		private static List<string> ParseActivityTypes(string json)
		{
			if (string.IsNullOrEmpty(json)) return null;
			try { return JsonConvert.DeserializeObject<List<string>>(json); }
			catch { return null; }
		}
	}
}
