namespace DynamicsActivitiesManageSubscriptions
{
	using System;
	using System.Collections.Generic;
	using System.Linq;
	using DynamicsActivities.DomDefinitions;
	using Newtonsoft.Json;
	using Skyline.DataMiner.Automation;
	using Skyline.DataMiner.Net.Apps.DataMinerObjectModel;
	using Skyline.DataMiner.Net.Messages.SLDataGateway;
	using Skyline.DataMiner.Net.Sections;

	/// <summary>
	/// CRUD automation script for Activity Subscriptions (DOM).
	/// Called by the frontend via ExecuteAutomationScript.
	/// Parameters: Action (list|create|update|delete), Payload (JSON), UserEmail, UserName.
	/// </summary>
	public class Script
	{
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
			domHelper = new DomHelper(engine.SendSLNetMessages, DomIds.ModuleId);

			var action = engine.GetScriptParam("Action")?.Value?.Trim().ToLowerInvariant() ?? string.Empty;
			var payload = engine.GetScriptParam("Payload")?.Value?.Trim() ?? "{}";
			var userEmail = engine.GetScriptParam("UserEmail")?.Value?.Trim() ?? string.Empty;
			var userName = engine.GetScriptParam("UserName")?.Value?.Trim() ?? string.Empty;

			string result;

			switch (action)
			{
				case "list":
					result = HandleList(userEmail);
					break;
				case "create":
					result = HandleCreate(payload, userEmail, userName);
					break;
				case "update":
					result = HandleUpdate(payload);
					break;
				case "delete":
					result = HandleDelete(payload);
					break;
				default:
					engine.ExitFail($"Unknown action: {action}");
					return;
			}

			engine.AddScriptOutput("result", result);
		}

		private string HandleList(string userEmail)
		{
			var filter = DomInstanceExposers.FieldValues.DomInstanceField(
				new FieldDescriptorID(DomIds.Subscription.UserEmail)).Equal(userEmail);

			var instances = domHelper.DomInstances.Read(filter);
			var subs = instances.Select(MapToDto).ToList();
			return JsonConvert.SerializeObject(subs);
		}

		private string HandleCreate(string payload, string userEmail, string userName)
		{
			var dto = JsonConvert.DeserializeObject<SubscriptionDto>(payload);

			var instance = new DomInstance
			{
				DomDefinitionId = new DomDefinitionId(DomIds.Subscription.DomDefinitionId),
			};

			var section = new Section(new SectionDefinitionID(DomIds.Subscription.SectionDefinitionId));
			section.AddOrReplaceFieldValue(new FieldValue(new FieldDescriptorID(DomIds.Subscription.UserEmail), new ValueWrapper<string>(userEmail)));
			section.AddOrReplaceFieldValue(new FieldValue(new FieldDescriptorID(DomIds.Subscription.UserName), new ValueWrapper<string>(userName)));
			section.AddOrReplaceFieldValue(new FieldValue(new FieldDescriptorID(DomIds.Subscription.ScopeType), new ValueWrapper<string>(dto.ScopeType ?? string.Empty)));
			section.AddOrReplaceFieldValue(new FieldValue(new FieldDescriptorID(DomIds.Subscription.ScopeValue), new ValueWrapper<string>(dto.ScopeValue ?? string.Empty)));
			section.AddOrReplaceFieldValue(new FieldValue(new FieldDescriptorID(DomIds.Subscription.ScopeLabel), new ValueWrapper<string>(dto.ScopeLabel ?? string.Empty)));
			section.AddOrReplaceFieldValue(new FieldValue(new FieldDescriptorID(DomIds.Subscription.Frequency), new ValueWrapper<string>(dto.Frequency ?? "daily")));
			section.AddOrReplaceFieldValue(new FieldValue(new FieldDescriptorID(DomIds.Subscription.ActivityTypes), new ValueWrapper<string>(dto.ActivityTypes != null ? JsonConvert.SerializeObject(dto.ActivityTypes) : null)));
			section.AddOrReplaceFieldValue(new FieldValue(new FieldDescriptorID(DomIds.Subscription.Enabled), new ValueWrapper<bool>(true)));
			section.AddOrReplaceFieldValue(new FieldValue(new FieldDescriptorID(DomIds.Subscription.LastSentAt), new ValueWrapper<string>(null)));

			instance.Sections.Add(section);
			var created = domHelper.DomInstances.Create(instance);

			return JsonConvert.SerializeObject(MapToDto(created));
		}

		private string HandleUpdate(string payload)
		{
			var dto = JsonConvert.DeserializeObject<SubscriptionDto>(payload);
			if (string.IsNullOrEmpty(dto.Id))
			{
				return JsonConvert.SerializeObject(new { error = "Missing id" });
			}

			var domInstanceId = new DomInstanceId(Guid.Parse(dto.Id));
			var existing = domHelper.DomInstances.Read(DomInstanceExposers.Id.Equal(domInstanceId)).FirstOrDefault();
			if (existing == null)
			{
				return JsonConvert.SerializeObject(new { error = "Not found" });
			}

			var section = existing.Sections.FirstOrDefault();
			if (section == null) return JsonConvert.SerializeObject(new { error = "No section" });

			if (dto.ScopeType != null)
				section.AddOrReplaceFieldValue(new FieldValue(new FieldDescriptorID(DomIds.Subscription.ScopeType), new ValueWrapper<string>(dto.ScopeType)));
			if (dto.ScopeValue != null)
				section.AddOrReplaceFieldValue(new FieldValue(new FieldDescriptorID(DomIds.Subscription.ScopeValue), new ValueWrapper<string>(dto.ScopeValue)));
			if (dto.ScopeLabel != null)
				section.AddOrReplaceFieldValue(new FieldValue(new FieldDescriptorID(DomIds.Subscription.ScopeLabel), new ValueWrapper<string>(dto.ScopeLabel)));
			if (dto.Frequency != null)
				section.AddOrReplaceFieldValue(new FieldValue(new FieldDescriptorID(DomIds.Subscription.Frequency), new ValueWrapper<string>(dto.Frequency)));
			if (dto.ActivityTypes != null)
				section.AddOrReplaceFieldValue(new FieldValue(new FieldDescriptorID(DomIds.Subscription.ActivityTypes), new ValueWrapper<string>(JsonConvert.SerializeObject(dto.ActivityTypes))));
			if (dto.Enabled.HasValue)
				section.AddOrReplaceFieldValue(new FieldValue(new FieldDescriptorID(DomIds.Subscription.Enabled), new ValueWrapper<bool>(dto.Enabled.Value)));

			var updated = domHelper.DomInstances.Update(existing);
			return JsonConvert.SerializeObject(MapToDto(updated));
		}

		private string HandleDelete(string payload)
		{
			var dto = JsonConvert.DeserializeObject<SubscriptionDto>(payload);
			if (string.IsNullOrEmpty(dto.Id))
			{
				return JsonConvert.SerializeObject(new { error = "Missing id" });
			}

			var domInstanceId = new DomInstanceId(Guid.Parse(dto.Id));
			var existing = domHelper.DomInstances.Read(DomInstanceExposers.Id.Equal(domInstanceId)).FirstOrDefault();
			if (existing != null)
			{
				domHelper.DomInstances.Delete(existing);
			}

			return JsonConvert.SerializeObject(new { success = true });
		}

		private static SubscriptionDto MapToDto(DomInstance instance)
		{
			var section = instance.Sections.FirstOrDefault();
			return new SubscriptionDto
			{
				Id = instance.ID?.Id.ToString(),
				ScopeType = GetFieldValue<string>(section, DomIds.Subscription.ScopeType),
				ScopeValue = GetFieldValue<string>(section, DomIds.Subscription.ScopeValue),
				ScopeLabel = GetFieldValue<string>(section, DomIds.Subscription.ScopeLabel),
				Frequency = GetFieldValue<string>(section, DomIds.Subscription.Frequency),
				ActivityTypes = ParseActivityTypes(GetFieldValue<string>(section, DomIds.Subscription.ActivityTypes)),
				Enabled = GetFieldValue<bool>(section, DomIds.Subscription.Enabled),
				LastSentAt = GetFieldValue<string>(section, DomIds.Subscription.LastSentAt),
				UserEmail = GetFieldValue<string>(section, DomIds.Subscription.UserEmail),
				UserName = GetFieldValue<string>(section, DomIds.Subscription.UserName),
			};
		}

		private static T GetFieldValue<T>(Section section, Guid fieldId)
		{
			if (section == null) return default;
			var fieldValue = section.FieldValues.FirstOrDefault(f => f.FieldDescriptorID.Id == fieldId);
			if (fieldValue?.Value?.Value is T typed) return typed;
			return default;
		}

		private static List<string> ParseActivityTypes(string json)
		{
			if (string.IsNullOrEmpty(json)) return null;
			try { return JsonConvert.DeserializeObject<List<string>>(json); }
			catch { return null; }
		}
	}

	internal class SubscriptionDto
	{
		[JsonProperty("id")]
		public string Id { get; set; }

		[JsonProperty("scopeType")]
		public string ScopeType { get; set; }

		[JsonProperty("scopeValue")]
		public string ScopeValue { get; set; }

		[JsonProperty("scopeLabel")]
		public string ScopeLabel { get; set; }

		[JsonProperty("frequency")]
		public string Frequency { get; set; }

		[JsonProperty("activityTypes")]
		public List<string> ActivityTypes { get; set; }

		[JsonProperty("enabled")]
		public bool? Enabled { get; set; }

		[JsonProperty("lastSentAt")]
		public string LastSentAt { get; set; }

		[JsonProperty("userEmail")]
		public string UserEmail { get; set; }

		[JsonProperty("userName")]
		public string UserName { get; set; }
	}
}
