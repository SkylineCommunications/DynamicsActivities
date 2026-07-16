namespace DynamicsActivitiesSummarize
{
	using System;
	using System.Collections.Generic;
	using System.Globalization;
	using System.Linq;
	using System.Reflection;
	using System.Text;
	using System.Threading.Tasks;
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
		private const string InfoPrefix = "[Summarize]";
		private const string SummaryHeadingStyle = "font-size:13px;font-weight:700;color:#1d4ed8;margin:0 0 8px;";
		private const string TimelineHeadingStyle = "font-size:13px;font-weight:700;color:#1d4ed8;margin:8px 0;";
		private const string ParagraphStyle = "margin:0 0 8px;";
		private const string ListStyle = "margin:0 0 8px;padding-left:18px;";
		private const string ListItemStyle = "margin:0 0 6px;";
		private const int MaxTimelinePoints = 3;

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
			engine.GenerateInformation($"{InfoPrefix} Started. Activities={request.Activities.Count}, Scope='{SafeValue(request.ScopeLabel)}', Period={SafeValue(request.FromUtc)} to {SafeValue(request.UntilUtc)}.");
			if (request.Activities.Count == 0)
			{
				engine.GenerateInformation($"{InfoPrefix} No activities received. Returning deterministic empty summary.");
				var emptySummary = "No activities loaded yet.";
				engine.AddScriptOutput("result", JsonConvert.SerializeObject(new SummaryOutput
				{
					Summary = emptySummary,
					SummaryHtml = BuildSummaryHtml(emptySummary, request),
					GeneratedBy = "fallback",
					Warning = null,
					Diagnostics = "No activities were provided in the payload.",
				}));
				return;
			}

			var prompt = BuildPrompt(request);
			engine.GenerateInformation($"{InfoPrefix} Attempting Assistant timeline summary.");
			var summary = TryGenerateAssistantSummary(engine, prompt, out var warning, out var diagnostics);
			var generatedBy = "assistant";
			if (String.IsNullOrWhiteSpace(summary))
			{
				summary = BuildFallbackSummary(request);
				generatedBy = "fallback";
				if (!String.IsNullOrWhiteSpace(warning))
				{
					engine.GenerateInformation($"{InfoPrefix} Assistant summary unavailable. Reason: {warning}");
				}

				if (!String.IsNullOrWhiteSpace(diagnostics))
				{
					engine.GenerateInformation($"{InfoPrefix} Assistant diagnostics: {diagnostics}");
				}
			}
			else
			{
				engine.GenerateInformation($"{InfoPrefix} Assistant summary generated successfully.");
			}

			engine.GenerateInformation($"{InfoPrefix} Completed. GeneratedBy={generatedBy}, SummaryLength={summary.Length}.");
			var summaryHtml = BuildSummaryHtml(summary, request);

			engine.AddScriptOutput("result", JsonConvert.SerializeObject(new SummaryOutput
			{
				Summary = summary,
				SummaryHtml = summaryHtml,
				GeneratedBy = generatedBy,
				Warning = warning,
				Diagnostics = diagnostics,
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
				var changedOn = SafeValue(GetActivityTimelineTimestampUtc(activity));
				var regarding = SafeValue(activity.Regarding);
				var subject = SafeValue(activity.Subject);
				var description = TrimValue(SafeValue(activity.Description), 260);
				lines.Add("- [" + changedOn + "] " + type + " | Regarding: " + regarding + " | Subject: " + subject + " | Note: " + description);
			}

			return String.Join(Environment.NewLine, lines);
		}

		private static string TryGenerateAssistantSummary(IEngine engine, string prompt, out string warning, out string diagnostics)
		{
			warning = null;
			diagnostics = null;
			try
			{
				var getUserConnection = engine.GetType().GetMethod("GetUserConnection", BindingFlags.Public | BindingFlags.Instance, null, Type.EmptyTypes, null);
				if (getUserConnection == null)
				{
					warning = "IEngine.GetUserConnection() is unavailable on this DMA version.";
					diagnostics = "GetUserConnection reflection lookup returned null.";
					return null;
				}

				var userConnection = getUserConnection.Invoke(engine, null);
				if (userConnection == null)
				{
					warning = "Unable to resolve user connection for Assistant agent chat.";
					diagnostics = "GetUserConnection() returned null.";
					return null;
				}

				var helperResolution = ResolveChatHelperType();
				var helperType = helperResolution.ChatHelperType;
				if (helperType == null)
				{
					warning = "Assistant integration assembly/type was not found on this DMA.";
					diagnostics = helperResolution.Diagnostics;
					return null;
				}

				var createAsync = helperType
					.GetMethods(BindingFlags.Public | BindingFlags.Static)
					.FirstOrDefault(method => String.Equals(method.Name, "CreateAsync", StringComparison.Ordinal) && method.GetParameters().Length == 3);
				if (createAsync == null)
				{
					warning = "ChatHelper.CreateAsync(...) method not found.";
					diagnostics = "CreateAsync reflection lookup failed on '" + helperType.AssemblyQualifiedName + "'.";
					return null;
				}

				var createTaskObject = createAsync.Invoke(null, new object[] { userConnection, AssistantAgentId, (TimeSpan?)TimeSpan.FromSeconds(45) });
				if (createTaskObject == null)
				{
					warning = "Assistant chat helper creation returned no task.";
					diagnostics = "CreateAsync returned null task object.";
					return null;
				}

				var createTask = createTaskObject as Task;
				if (createTask == null)
				{
					warning = "Assistant chat helper creation was not a Task instance.";
					diagnostics = "CreateAsync returned unexpected type '" + createTaskObject.GetType().FullName + "'.";
					return null;
				}

				var createAwaiter = createTaskObject.GetType().GetMethod("GetAwaiter", BindingFlags.Public | BindingFlags.Instance)?.Invoke(createTaskObject, null);
				var helper = createAwaiter?.GetType().GetMethod("GetResult", BindingFlags.Public | BindingFlags.Instance)?.Invoke(createAwaiter, null);
				if (helper == null)
				{
					warning = "Failed to instantiate Assistant ChatHelper.";
					diagnostics = "CreateAsync completed with null chat helper for '" + helperType.AssemblyQualifiedName + "'.";
					return null;
				}

				try
				{
					var sendMessage = helperType
						.GetMethods(BindingFlags.Public | BindingFlags.Instance)
						.FirstOrDefault(method => String.Equals(method.Name, "SendMessageAsync", StringComparison.Ordinal) && method.GetParameters().Length == 3);
					if (sendMessage == null)
					{
						warning = "ChatHelper.SendMessageAsync(...) method not found.";
						diagnostics = "SendMessageAsync(...) reflection lookup failed on '" + helperType.AssemblyQualifiedName + "'.";
						return null;
					}

					var responseTaskObject = sendMessage.Invoke(helper, new object[] { prompt, null, null });
					if (responseTaskObject == null)
					{
						warning = "Assistant agent returned no response task.";
						diagnostics = "SendMessageAsync returned null task object.";
						return null;
					}

					var responseTask = responseTaskObject as Task;
					if (responseTask == null)
					{
						warning = "Assistant response task was not a Task instance.";
						diagnostics = "SendMessageAsync returned unexpected type '" + responseTaskObject.GetType().FullName + "'.";
						return null;
					}

					var awaiter = responseTaskObject.GetType().GetMethod("GetAwaiter", BindingFlags.Public | BindingFlags.Instance)?.Invoke(responseTaskObject, null);
					var responseObject = awaiter?.GetType().GetMethod("GetResult", BindingFlags.Public | BindingFlags.Instance)?.Invoke(awaiter, null);
					if (responseObject == null)
					{
						warning = "Assistant agent returned no response object.";
						diagnostics = "SendMessageAsync completed with null response object.";
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
				diagnostics = ex.ToString();
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
					ModifiedOnUtc = item["modifiedOnUtc"]?.Value<string>(),
					ChangedOnUtc = item["changedOnUtc"]?.Value<string>(),
					Type = item["type"]?.Value<string>(),
					Subject = item["subject"]?.Value<string>(),
					Regarding = item["regarding"]?.Value<string>(),
					Description = item["description"]?.Value<string>(),
				});
			}

			request.Activities = request.Activities
				.OrderByDescending(GetActivityTimelineTimestampSortKey)
				.ToList();

			return request;
		}

		private static ChatHelperResolution ResolveChatHelperType()
		{
			var diagnostics = new List<string>();
			var direct = Type.GetType("Skyline.DataMiner.Assistant.Integration.ChatHelper, Skyline.DataMiner.Assistant.Integration", false);
			if (direct != null)
			{
				return new ChatHelperResolution(direct, "Resolved through direct type lookup.");
			}

			foreach (var assemblyName in new[] { "Skyline.DataMiner.Assistant.Integration" })
			{
				try
				{
					var loadedAssembly = Assembly.Load(assemblyName);
					var loadedType = loadedAssembly?.GetType("Skyline.DataMiner.Assistant.Integration.ChatHelper", false);
					if (loadedType != null)
					{
						return new ChatHelperResolution(loadedType, "Resolved after loading assembly '" + assemblyName + "'.");
					}

					diagnostics.Add("Loaded '" + assemblyName + "' but ChatHelper type not found.");
				}
				catch (Exception ex)
				{
					diagnostics.Add("Failed to load '" + assemblyName + "': " + ex.Message);
				}
			}

			foreach (var assembly in AppDomain.CurrentDomain.GetAssemblies())
			{
				var candidate = assembly.GetType("Skyline.DataMiner.Assistant.Integration.ChatHelper", false);
				if (candidate != null)
				{
					return new ChatHelperResolution(candidate, "Resolved from already loaded assembly '" + assembly.FullName + "'.");
				}
			}

			var loadedAssistantAssemblies = AppDomain.CurrentDomain
				.GetAssemblies()
				.Select(assembly => assembly.GetName().Name)
				.Where(name => !String.IsNullOrWhiteSpace(name) && name.IndexOf("Assistant", StringComparison.OrdinalIgnoreCase) >= 0)
				.Distinct(StringComparer.OrdinalIgnoreCase)
				.ToList();
			diagnostics.Add("Loaded assemblies containing 'Assistant': " + (loadedAssistantAssemblies.Count == 0 ? "(none)" : String.Join(", ", loadedAssistantAssemblies)));
			return new ChatHelperResolution(null, String.Join(" | ", diagnostics));
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
				.Select(a => "[" + SafeValue(GetActivityTimelineTimestampUtc(a)) + "] " + SafeValue(a.Type) + ": " + SafeValue(a.Subject))
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

		private static string BuildSummaryHtml(string summary, SummaryRequest request)
		{
			var safeSummary = String.IsNullOrWhiteSpace(summary) ? "-" : summary.Trim();
			var topActivities = (request?.Activities ?? new List<ActivityInput>()).Take(MaxTimelinePoints).ToList();

			var sb = new StringBuilder();
			sb.Append("<div style='");
			sb.Append(SummaryHeadingStyle);
			sb.Append("'>Summary</div>");
			AppendPlainTextAsHtml(sb, safeSummary);
			sb.Append("<div style='");
			sb.Append(TimelineHeadingStyle);
			sb.Append("'>Latest timeline points</div>");
			if (topActivities.Count == 0)
			{
				sb.Append("<p style='");
				sb.Append(ParagraphStyle);
				sb.Append("'>No recent activity points available.</p>");
			}
			else
			{
				sb.Append("<ul style='");
				sb.Append(ListStyle);
				sb.Append("'>");
				foreach (var activity in topActivities)
				{
					var changedOn = SafeValue(GetActivityTimelineTimestampUtc(activity));
					var hasKnownTimestamp = !String.Equals(changedOn, "-", StringComparison.Ordinal);
					sb.Append("<li style='");
					sb.Append(ListItemStyle);
					sb.Append("'>");
					if (hasKnownTimestamp)
					{
						sb.Append("<strong>[");
						sb.Append(HtmlEncode(changedOn));
						sb.Append("]</strong> ");
					}
					sb.Append(HtmlEncode(SafeValue(activity.Type)));
					sb.Append(" — ");
					sb.Append(HtmlEncode(SafeValue(activity.Subject)));
					sb.Append("</li>");
				}
				sb.Append("</ul>");
			}
			return sb.ToString();
		}

		private static void AppendPlainTextAsHtml(StringBuilder sb, string text)
		{
			var lines = (text ?? String.Empty)
				.Split(new[] { "\r\n", "\n" }, StringSplitOptions.None)
				.Select(line => (line ?? String.Empty).Trim())
				.Where(line => line.Length > 0)
				.ToList();
			if (lines.Count == 0)
			{
				sb.Append("<p>-</p>");
				return;
			}

			var bulletLines = lines
				.Select(line => line.TrimStart('-', '*', '•', ' ').Trim())
				.Where(line => !IsSectionHeadingLine(line))
				.Where(line => line.Length > 0)
				.ToList();
			var allLinesAreBullets = lines.All(line => IsLikelyBulletLine(line));
			if (allLinesAreBullets && bulletLines.Count > 0)
			{
				sb.Append("<ul>");
				foreach (var line in bulletLines)
				{
					sb.Append("<li>");
					sb.Append(HtmlEncode(line));
					sb.Append("</li>");
				}

				sb.Append("</ul>");
				return;
			}

			foreach (var line in lines)
			{
				sb.Append("<p>");
				sb.Append(HtmlEncode(line));
				sb.Append("</p>");
			}
		}

		private static bool IsSectionHeadingLine(string line)
		{
			if (String.IsNullOrWhiteSpace(line))
			{
				return false;
			}

			var normalized = line.Trim().TrimEnd(':').Trim();
			var closeParen = normalized.IndexOf(')');
			if (closeParen > 0 && closeParen <= 3)
			{
				var prefix = normalized.Substring(0, closeParen);
				if (prefix.All(Char.IsDigit))
				{
					normalized = normalized.Substring(closeParen + 1).Trim();
				}
			}

			return String.Equals(normalized, "Key highlights", StringComparison.OrdinalIgnoreCase)
				|| String.Equals(normalized, "Account health and escalation status", StringComparison.OrdinalIgnoreCase)
				|| String.Equals(normalized, "Follow-up actions", StringComparison.OrdinalIgnoreCase);
		}

		private static bool IsLikelyBulletLine(string line)
		{
			if (String.IsNullOrWhiteSpace(line))
			{
				return false;
			}

			var trimmed = line.TrimStart();
			if (trimmed.StartsWith("-", StringComparison.Ordinal) || trimmed.StartsWith("*", StringComparison.Ordinal) || trimmed.StartsWith("•", StringComparison.Ordinal))
			{
				return true;
			}

			var closeParen = trimmed.IndexOf(')');
			if (closeParen > 0 && closeParen <= 3)
			{
				var prefix = trimmed.Substring(0, closeParen);
				return prefix.All(Char.IsDigit);
			}

			return false;
		}

		private static string HtmlEncode(string value)
		{
			if (String.IsNullOrEmpty(value))
			{
				return String.Empty;
			}

			return value
				.Replace("&", "&amp;")
				.Replace("<", "&lt;")
				.Replace(">", "&gt;")
				.Replace("\"", "&quot;")
				.Replace("'", "&#39;");
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

		private static string GetActivityTimelineTimestampUtc(ActivityInput activity)
		{
			if (activity == null)
			{
				return null;
			}

			if (!String.IsNullOrWhiteSpace(activity.ChangedOnUtc))
			{
				return activity.ChangedOnUtc;
			}

			if (!String.IsNullOrWhiteSpace(activity.ModifiedOnUtc))
			{
				return activity.ModifiedOnUtc;
			}

			return activity.CreatedOnUtc;
		}

		private static DateTime GetActivityTimelineTimestampSortKey(ActivityInput activity)
		{
			var raw = GetActivityTimelineTimestampUtc(activity);
			if (String.IsNullOrWhiteSpace(raw))
			{
				return DateTime.MinValue;
			}

			if (DateTime.TryParseExact(raw, "o", CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out var parsed))
			{
				return parsed;
			}

			return DateTime.MinValue;
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

			[JsonProperty("modifiedOnUtc")]
			public string ModifiedOnUtc { get; set; }

			[JsonProperty("changedOnUtc")]
			public string ChangedOnUtc { get; set; }

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

			[JsonProperty("summaryHtml")]
			public string SummaryHtml { get; set; }

			[JsonProperty("generatedBy")]
			public string GeneratedBy { get; set; }

			[JsonProperty("warning")]
			public string Warning { get; set; }

			[JsonProperty("diagnostics")]
			public string Diagnostics { get; set; }
		}

		private sealed class ChatHelperResolution
		{
			public ChatHelperResolution(Type chatHelperType, string diagnostics)
			{
				ChatHelperType = chatHelperType;
				Diagnostics = diagnostics;
			}

			public Type ChatHelperType { get; private set; }

			public string Diagnostics { get; private set; }
		}
	}
}
