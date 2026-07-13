namespace DynamicsActivitiesSummarize
{
	using System;
	using System.Collections.Generic;
	using System.Globalization;
	using System.Linq;
	using System.Reflection;
	using System.Text;
	using Newtonsoft.Json;
	using Newtonsoft.Json.Linq;
	using Skyline.DataMiner.Automation;

	/// <summary>
	/// Summarizes activity timelines using the DataMiner Assistant agent when available.
	/// Falls back to a deterministic summary if the agent integration is unavailable.
	/// </summary>
	public class Script
	{
		private static readonly Guid AssistantAgentId = new Guid("7a7ee855-cb26-4067-bc8e-122a961ac4cf");

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
			var payload = engine.GetScriptParam("Payload")?.Value?.Trim();
			if (String.IsNullOrWhiteSpace(payload))
			{
				engine.ExitFail("Missing Payload script parameter.");
				return;
			}

			SummaryRequest request;
			try
			{
				request = ParseSummaryRequest(payload);
			}
			catch (Exception ex)
			{
				engine.ExitFail("Invalid Payload JSON: " + ex.Message);
				return;
			}

			request.Activities = request.Activities ?? new List<ActivityInput>();
			if (request.Activities.Count == 0)
			{
				engine.AddScriptOutput("result", JsonConvert.SerializeObject(new SummaryOutput
				{
					Summary = "No activities loaded yet.",
					GeneratedBy = "fallback",
					Warning = null,
				}));
				return;
			}

			var prompt = BuildPrompt(request);
			var summary = TryGenerateAssistantSummary(engine, prompt, out var warning);
			var generatedBy = "assistant";
			if (String.IsNullOrWhiteSpace(summary))
			{
				summary = BuildFallbackSummary(request);
				generatedBy = "fallback";
			}

			engine.AddScriptOutput("result", JsonConvert.SerializeObject(new SummaryOutput
			{
				Summary = summary,
				GeneratedBy = generatedBy,
				Warning = warning,
			}));
		}

		private static string BuildPrompt(SummaryRequest request)
		{
			var scopeLabel = String.IsNullOrWhiteSpace(request.ScopeLabel) ? "selected scope" : request.ScopeLabel.Trim();
			var fromValue = String.IsNullOrWhiteSpace(request.FromUtc) ? "unknown" : request.FromUtc.Trim();
			var untilValue = String.IsNullOrWhiteSpace(request.UntilUtc) ? "now" : request.UntilUtc.Trim();

			var lines = new List<string>();
			lines.Add("You are assisting a technical account manager.");
			lines.Add("Summarize the activity timeline into concise meeting-prep context.");
			lines.Add("Output format (plain text, no markdown):");
			lines.Add("1) Key highlights");
			lines.Add("2) Account health and escalation status");
			lines.Add("3) Follow-up actions");
			lines.Add("Keep the response under 260 words.");
			lines.Add(String.Empty);
			lines.Add("Scope: " + scopeLabel);
			lines.Add("Period UTC: " + fromValue + " to " + untilValue);
			lines.Add("Activities (newest first):");

			foreach (var activity in request.Activities.Take(50))
			{
				var type = SafeValue(activity.Type);
				var createdOn = SafeValue(activity.CreatedOnUtc);
				var regarding = SafeValue(activity.Regarding);
				var subject = SafeValue(activity.Subject);
				var description = TrimValue(SafeValue(activity.Description), 260);
				lines.Add("- [" + createdOn + "] " + type + " | Regarding: " + regarding + " | Subject: " + subject + " | Note: " + description);
			}

			return String.Join(Environment.NewLine, lines);
		}

		private static string TryGenerateAssistantSummary(IEngine engine, string prompt, out string warning)
		{
			warning = null;
			try
			{
				var getUserConnection = engine.GetType().GetMethod("GetUserConnection", BindingFlags.Public | BindingFlags.Instance, null, Type.EmptyTypes, null);
				if (getUserConnection == null)
				{
					warning = "IEngine.GetUserConnection() is unavailable on this DMA version.";
					return null;
				}

				var userConnection = getUserConnection.Invoke(engine, null);
				if (userConnection == null)
				{
					warning = "Unable to resolve user connection for Assistant agent chat.";
					return null;
				}

				var helperType = ResolveAgentHelperType();
				if (helperType == null)
				{
					warning = "Skyline.DataMiner.Assistant.Integration is not available.";
					return null;
				}

				var helper = Activator.CreateInstance(helperType, userConnection, AssistantAgentId);
				if (helper == null)
				{
					warning = "Failed to instantiate Assistant AgentHelper.";
					return null;
				}

				try
				{
					var sendMessage = helperType.GetMethod("SendMessage", BindingFlags.Public | BindingFlags.Instance, null, new[] { typeof(string) }, null);
					if (sendMessage == null)
					{
						warning = "AgentHelper.SendMessage(string) method not found.";
						return null;
					}

					var responseObject = sendMessage.Invoke(helper, new object[] { prompt });
					if (responseObject == null)
					{
						warning = "Assistant agent returned no response object.";
						return null;
					}

					var responseProperty = responseObject.GetType().GetProperty("Response", BindingFlags.Public | BindingFlags.Instance);
					var responseValue = responseProperty?.GetValue(responseObject) as string;
					if (String.IsNullOrWhiteSpace(responseValue))
					{
						responseValue = responseObject.ToString();
					}

					return String.IsNullOrWhiteSpace(responseValue) ? null : responseValue.Trim();
				}

				finally
				{
					(helper as IDisposable)?.Dispose();
				}
			}
			catch (Exception ex)
			{
				warning = "Assistant call failed: " + ex.Message;
				return null;
			}
		}

		private static SummaryRequest ParseSummaryRequest(string payload)
		{
			var root = JObject.Parse(payload ?? "{}");
			var request = new SummaryRequest
			{
				ScopeLabel = root["scopeLabel"]?.Value<string>(),
				FromUtc = root["fromUtc"]?.Value<string>(),
				UntilUtc = root["untilUtc"]?.Value<string>(),
				Activities = new List<ActivityInput>(),
			};

			var activityArray = root["activities"] as JArray;
			if (activityArray == null)
			{
				return request;
			}

			foreach (var token in activityArray)
			{
				var item = token as JObject;
				if (item == null)
				{
					continue;
				}

				request.Activities.Add(new ActivityInput
				{
					CreatedOnUtc = item["createdOnUtc"]?.Value<string>(),
					Type = item["type"]?.Value<string>(),
					Subject = item["subject"]?.Value<string>(),
					Regarding = item["regarding"]?.Value<string>(),
					Description = item["description"]?.Value<string>(),
				});
			}

			return request;
		}

		private static Type ResolveAgentHelperType()
		{
			var direct = Type.GetType("Skyline.DataMiner.Core.Assistant.AgentHelper, Skyline.DataMiner.Assistant.Integration", false);
			if (direct != null)
			{
				return direct;
			}

			foreach (var assembly in AppDomain.CurrentDomain.GetAssemblies())
			{
				var candidate = assembly.GetType("Skyline.DataMiner.Core.Assistant.AgentHelper", false);
				if (candidate != null)
				{
					return candidate;
				}
			}

			return null;
		}

		private static string BuildFallbackSummary(SummaryRequest request)
		{
			var activities = request.Activities ?? new List<ActivityInput>();
			var byType = activities
				.GroupBy(a => SafeValue(a.Type))
				.OrderByDescending(g => g.Count())
				.ToList();

			var topItems = activities
				.Take(3)
				.Select(a => "[" + SafeValue(a.CreatedOnUtc) + "] " + SafeValue(a.Type) + ": " + SafeValue(a.Subject))
				.ToList();

			var sb = new StringBuilder();
			sb.Append("Loaded ");
			sb.Append(activities.Count.ToString(CultureInfo.InvariantCulture));
			sb.Append(" activities");
			if (!String.IsNullOrWhiteSpace(request.ScopeLabel))
			{
				sb.Append(" for ");
				sb.Append(request.ScopeLabel.Trim());
			}
			sb.Append(". ");
			sb.Append("Most frequent types: ");
			sb.Append(String.Join(", ", byType.Take(3).Select(g => g.Key + " (" + g.Count().ToString(CultureInfo.InvariantCulture) + ")")));
			sb.Append(". ");

			if (topItems.Count > 0)
			{
				sb.Append("Latest timeline points: ");
				sb.Append(String.Join("; ", topItems));
				sb.Append(". ");
			}

			sb.Append("Follow-up: review latest escalations, align owners on next customer actions, and confirm commitments before the next meeting.");
			return sb.ToString();
		}

		private static string SafeValue(string value)
		{
			return String.IsNullOrWhiteSpace(value) ? "-" : value.Trim();
		}

		private static string TrimValue(string value, int maxLength)
		{
			if (String.IsNullOrEmpty(value) || value.Length <= maxLength)
			{
				return value;
			}

			return value.Substring(0, maxLength) + "...";
		}

		private sealed class SummaryRequest
		{
			[JsonProperty("scopeLabel")]
			public string ScopeLabel { get; set; }

			[JsonProperty("fromUtc")]
			public string FromUtc { get; set; }

			[JsonProperty("untilUtc")]
			public string UntilUtc { get; set; }

			[JsonProperty("activities")]
			public List<ActivityInput> Activities { get; set; }
		}

		private sealed class ActivityInput
		{
			[JsonProperty("createdOnUtc")]
			public string CreatedOnUtc { get; set; }

			[JsonProperty("type")]
			public string Type { get; set; }

			[JsonProperty("subject")]
			public string Subject { get; set; }

			[JsonProperty("regarding")]
			public string Regarding { get; set; }

			[JsonProperty("description")]
			public string Description { get; set; }
		}

		private sealed class SummaryOutput
		{
			[JsonProperty("summary")]
			public string Summary { get; set; }

			[JsonProperty("generatedBy")]
			public string GeneratedBy { get; set; }

			[JsonProperty("warning")]
			public string Warning { get; set; }
		}
	}
}
