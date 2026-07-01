namespace DynamicsActivitiesNotifySubscribers
{
	using System;
	using System.Collections.Generic;
	using System.Linq;
	using System.Text;
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
		// DOM IDs — keep in sync across: ManageSubscriptions, install script, and this script.
		private const string ModuleId = "dynamics_activities";
		private static readonly Guid FieldUserEmail = new Guid("c3a4b5c6-7d8e-9f0a-1b2c-3d4e5f607182");
		private static readonly Guid FieldUserName = new Guid("d4b5c6d7-8e9f-0a1b-2c3d-4e5f60718293");
		private static readonly Guid FieldScopeType = new Guid("e5c6d7e8-9f0a-1b2c-3d4e-5f6071829304");
		private static readonly Guid FieldScopeValue = new Guid("f6d7e8f9-0a1b-2c3d-4e5f-607182930415");
		private static readonly Guid FieldScopeLabel = new Guid("07e8f9a0-1b2c-3d4e-5f60-718293041526");
		private static readonly Guid FieldFrequency = new Guid("18f9a0b1-2c3d-4e5f-6071-829304152637");
		private static readonly Guid FieldActivityTypes = new Guid("29a0b1c2-3d4e-5f60-7182-930415263748");
		private static readonly Guid FieldEnabled = new Guid("3ab1c2d3-4e5f-6071-8293-041526374859");
		private static readonly Guid FieldLastSentAt = new Guid("4bc2d3e4-5f60-7182-9304-15263748596a");

		private DomHelper domHelper;

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
			domHelper = new DomHelper(engine.SendSLNetMessages, ModuleId);

			var frequency = engine.GetScriptParam("Frequency")?.Value?.Trim().ToLowerInvariant() ?? "daily";
			var now = DateTime.UtcNow;

			var enabledFilter = DomInstanceExposers.FieldValues.DomInstanceField(
				new FieldDescriptorID(FieldEnabled)).Equal(true);
			var frequencyFilter = DomInstanceExposers.FieldValues.DomInstanceField(
				new FieldDescriptorID(FieldFrequency)).Equal(frequency);

			var allInstances = domHelper.DomInstances.Read(enabledFilter.AND(frequencyFilter));
			engine.GenerateInformation($"[NotifySubscribers] Found {allInstances.Count} enabled '{frequency}' subscription(s).");

			int emailsSent = 0;

			foreach (var instance in allInstances)
			{
				var section = instance.Sections.FirstOrDefault();
				if (section == null) continue;

				var userEmail = GetField<string>(section, FieldUserEmail);
				var userName = GetField<string>(section, FieldUserName);
				var scopeType = GetField<string>(section, FieldScopeType);
				var scopeValue = GetField<string>(section, FieldScopeValue);
				var scopeLabel = GetField<string>(section, FieldScopeLabel);
				var activityTypesJson = GetField<string>(section, FieldActivityTypes);
				var lastSentAtStr = GetField<string>(section, FieldLastSentAt);

				if (string.IsNullOrEmpty(userEmail)) continue;

				var lastSentAt = ParseDateTime(lastSentAtStr) ?? DateTime.MinValue;

				if (!ShouldSend(frequency, lastSentAt, now)) continue;

				var subject = $"[DynamicsActivities] Activity digest for {scopeLabel ?? scopeValue}";
				var body = BuildEmailBody(userName, scopeType, scopeValue, scopeLabel, activityTypesJson, lastSentAt, now);

				try
				{
					engine.SendEmail(body, subject, userEmail);
					emailsSent++;

					section.AddOrReplaceFieldValue(new FieldValue(
						new FieldDescriptorID(FieldLastSentAt),
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
					return true;
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
