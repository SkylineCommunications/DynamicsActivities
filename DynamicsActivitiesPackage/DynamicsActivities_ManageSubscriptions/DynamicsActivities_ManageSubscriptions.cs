namespace DynamicsActivitiesManageSubscriptions
{
	using System;
	using System.Collections.Generic;
	using System.Linq;
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
		// DOM IDs — keep in sync across: NotifySubscribers, install script, and this script.
		private const string ModuleId = "dynamics_activities";
		private static readonly Guid DomDefinitionId = new Guid("b2f3e4d5-6c7d-8e9f-0a1b-2c3d4e5f6071");
		private static readonly Guid SectionDefinitionId = new Guid("a1e2f3d4-5b6c-7d8e-9f0a-1b2c3d4e5f60");
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
				new FieldDescriptorID(FieldUserEmail)).Equal(userEmail);

			var instances = domHelper.DomInstances.Read(filter);
			var subs = instances.Select(MapToDto).ToList();
			return JsonConvert.SerializeObject(subs);
		}

		private string HandleCreate(string payload, string userEmail, string userName)
		{
			var dto = JsonConvert.DeserializeObject<SubscriptionDto>(payload);

			var instance = new DomInstance
			{
				DomDefinitionId = new DomDefinitionId(DomDefinitionId),
			};

			var section = new Section(new SectionDefinitionID(SectionDefinitionId));
			section.AddOrReplaceFieldValue(new FieldValue(new FieldDescriptorID(FieldUserEmail), new ValueWrapper<string>(userEmail)));
			section.AddOrReplaceFieldValue(new FieldValue(new FieldDescriptorID(FieldUserName), new ValueWrapper<string>(userName)));
			section.AddOrReplaceFieldValue(new FieldValue(new FieldDescriptorID(FieldScopeType), new ValueWrapper<string>(dto.ScopeType ?? string.Empty)));
			section.AddOrReplaceFieldValue(new FieldValue(new FieldDescriptorID(FieldScopeValue), new ValueWrapper<string>(dto.ScopeValue ?? string.Empty)));
			section.AddOrReplaceFieldValue(new FieldValue(new FieldDescriptorID(FieldScopeLabel), new ValueWrapper<string>(dto.ScopeLabel ?? string.Empty)));
			section.AddOrReplaceFieldValue(new FieldValue(new FieldDescriptorID(FieldFrequency), new ValueWrapper<string>(dto.Frequency ?? "daily")));
			section.AddOrReplaceFieldValue(new FieldValue(new FieldDescriptorID(FieldActivityTypes), new ValueWrapper<string>(dto.ActivityTypes != null ? JsonConvert.SerializeObject(dto.ActivityTypes) : null)));
			section.AddOrReplaceFieldValue(new FieldValue(new FieldDescriptorID(FieldEnabled), new ValueWrapper<bool>(true)));
			section.AddOrReplaceFieldValue(new FieldValue(new FieldDescriptorID(FieldLastSentAt), new ValueWrapper<string>(null)));

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
				section.AddOrReplaceFieldValue(new FieldValue(new FieldDescriptorID(FieldScopeType), new ValueWrapper<string>(dto.ScopeType)));
			if (dto.ScopeValue != null)
				section.AddOrReplaceFieldValue(new FieldValue(new FieldDescriptorID(FieldScopeValue), new ValueWrapper<string>(dto.ScopeValue)));
			if (dto.ScopeLabel != null)
				section.AddOrReplaceFieldValue(new FieldValue(new FieldDescriptorID(FieldScopeLabel), new ValueWrapper<string>(dto.ScopeLabel)));
			if (dto.Frequency != null)
				section.AddOrReplaceFieldValue(new FieldValue(new FieldDescriptorID(FieldFrequency), new ValueWrapper<string>(dto.Frequency)));
			if (dto.ActivityTypes != null)
				section.AddOrReplaceFieldValue(new FieldValue(new FieldDescriptorID(FieldActivityTypes), new ValueWrapper<string>(JsonConvert.SerializeObject(dto.ActivityTypes))));
			if (dto.Enabled.HasValue)
				section.AddOrReplaceFieldValue(new FieldValue(new FieldDescriptorID(FieldEnabled), new ValueWrapper<bool>(dto.Enabled.Value)));

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
				ScopeType = GetFieldValue<string>(section, FieldScopeType),
				ScopeValue = GetFieldValue<string>(section, FieldScopeValue),
				ScopeLabel = GetFieldValue<string>(section, FieldScopeLabel),
				Frequency = GetFieldValue<string>(section, FieldFrequency),
				ActivityTypes = ParseActivityTypes(GetFieldValue<string>(section, FieldActivityTypes)),
				Enabled = GetFieldValue<bool>(section, FieldEnabled),
				LastSentAt = GetFieldValue<string>(section, FieldLastSentAt),
				UserEmail = GetFieldValue<string>(section, FieldUserEmail),
				UserName = GetFieldValue<string>(section, FieldUserName),
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
