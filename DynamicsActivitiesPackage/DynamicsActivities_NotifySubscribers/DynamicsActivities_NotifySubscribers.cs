namespace DynamicsActivitiesNotifySubscribers
{
	using System;
	using System.Collections.Generic;
	using System.Globalization;
	using System.Linq;
	using System.Net.Http;
	using System.Net.Http.Headers;
	using System.Reflection;
	using System.Text;
	using System.Threading;
	using Newtonsoft.Json;
	using Newtonsoft.Json.Linq;
	using Skyline.DataMiner.Automation;
	using Skyline.DataMiner.Net.Apps.DataMinerObjectModel;
	using Skyline.DataMiner.Net.Messages.SLDataGateway;
	using Skyline.DataMiner.Net.Sections;

	public class Script
	{
		private const string ModuleId = "dynamics_activities";
		private const string DataverseBaseUrl = "https://skyline365-qa.crm4.dynamics.com";
		private const string ActivitiesAppUrl = "https://solutionsdma-skyline.on.dataminer.services/public/DynamicsActivities/";
		private const string TenantId = "5f175691-8d1c-4932-b7c8-ce990839ac40";
		private const string ClientId = "f7274be0-4d28-4b1b-8691-6e2da803ba9e";

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
		private HttpClient httpClient;
		private string accessToken;
		private string clientSecret;
		private IEngine engine;

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
			this.engine = engine;
			domHelper = new DomHelper(engine.SendSLNetMessages, ModuleId);
			httpClient = new HttpClient();
			clientSecret = engine.GetScriptParam("ClientSecret")?.Value?.Trim();
			if (string.IsNullOrWhiteSpace(clientSecret))
			{
				throw new InvalidOperationException("Missing ClientSecret script parameter.");
			}

			accessToken = AcquireDataverseToken();

			var frequency = engine.GetScriptParam("Frequency")?.Value?.Trim().ToLowerInvariant() ?? "daily";
			var now = DateTime.UtcNow;

			var enabledFilter = DomInstanceExposers.FieldValues.DomInstanceField(new FieldDescriptorID(FieldEnabled)).Equal(true);
			var frequencyFilter = DomInstanceExposers.FieldValues.DomInstanceField(new FieldDescriptorID(FieldFrequency)).Equal(frequency);

			var allInstances = domHelper.DomInstances.Read(enabledFilter.AND(frequencyFilter));
			engine.GenerateInformation($"[NotifySubscribers] Found {allInstances.Count} enabled '{frequency}' subscription(s).");

			var emailsSent = 0;
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
				var createdAt = GetSubscriptionCreatedAt(instance);
				var since = GetEffectiveSince(lastSentAt, createdAt);
				var activities = FetchActivities(scopeType, scopeValue, activityTypesJson, since, now);
				if (activities.Count == 0)
				{
					engine.GenerateInformation($"[NotifySubscribers] No new activities for sub {instance.ID.Id} ({scopeType}:{scopeValue}) since {since:o}. LastSentAt={lastSentAt:o}, CreatedAt={(createdAt.HasValue ? createdAt.Value.ToString("o") : "n/a")}.");
					continue;
				}

				var subject = $"[DynamicsActivities] Activity digest for {scopeLabel ?? scopeValue}";
				var body = BuildEmailBody(userName, scopeType, scopeValue, scopeLabel, activityTypesJson, since, now, activities);

				try
				{
					engine.SendEmail(body, subject, userEmail);
					emailsSent++;
					section.AddOrReplaceFieldValue(new FieldValue(new FieldDescriptorID(FieldLastSentAt), new ValueWrapper<string>(now.ToString("o"))));
					domHelper.DomInstances.Update(instance);
				}
				catch (Exception ex)
				{
					engine.GenerateInformation($"[NotifySubscribers] Failed to email {userEmail}: {ex.Message}");
				}
			}

			engine.GenerateInformation($"[NotifySubscribers] Done. Sent {emailsSent} email(s).");
		}

		private string AcquireDataverseToken()
		{
			var tokenEndpoint = $"https://login.microsoftonline.com/{TenantId}/oauth2/v2.0/token";
			var body = new FormUrlEncodedContent(new[]
			{
				new KeyValuePair<string, string>("grant_type", "client_credentials"),
				new KeyValuePair<string, string>("client_id", ClientId),
				new KeyValuePair<string, string>("client_secret", clientSecret),
				new KeyValuePair<string, string>("scope", $"{DataverseBaseUrl}/.default"),
			});

			var response = httpClient.PostAsync(tokenEndpoint, body).GetAwaiter().GetResult();
			var json = response.Content.ReadAsStringAsync().GetAwaiter().GetResult();
			if (!response.IsSuccessStatusCode)
			{
				throw new InvalidOperationException($"Token request failed ({(int)response.StatusCode}): {json}");
			}

			var parsed = JObject.Parse(json);
			var token = parsed["access_token"]?.Value<string>();
			if (string.IsNullOrEmpty(token)) throw new InvalidOperationException("Token response did not include access_token.");
			return token;
		}

		private List<ActivityItem> FetchActivities(string scopeType, string scopeValue, string activityTypesJson, DateTime since, DateTime until)
		{
			var scope = ResolveScopeContext(scopeType, scopeValue);
			var requestedTypes = ParseActivityTypes(activityTypesJson);
			var includeAllTypes = requestedTypes == null || requestedTypes.Count == 0;
			var activities = new List<ActivityItem>();
			var fromIso = BuildCreatedOnLowerBound(since);
			var escalationScope = String.Equals((scopeType ?? String.Empty).Trim(), "escalation", StringComparison.OrdinalIgnoreCase);

			if (escalationScope)
			{
				return FetchEscalationScopedActivities(fromIso, includeAllTypes, requestedTypes);
			}

			bool want(params string[] values) => includeAllTypes || values.Any(v => requestedTypes.Contains(v, StringComparer.OrdinalIgnoreCase));

			if (want("phonecall", "phonecalls")) activities.AddRange(FetchStandardActivities("phonecalls", "Phone Call", "_regardingobjectid_value", scope.ActivityLookupIds, fromIso));
			if (want("appointment", "appointments")) activities.AddRange(FetchStandardActivities("appointments", "Appointment", "_regardingobjectid_value", scope.ActivityLookupIds, fromIso));
			if (want("email", "emails")) activities.AddRange(FetchStandardActivities("emails", "Email", "_regardingobjectid_value", scope.ActivityLookupIds, fromIso));
			if (want("escalation", "slc_escalations")) activities.AddRange(FetchEscalations(scope.ActivityLookupIds, fromIso));
			if (want("lead", "leads")) activities.AddRange(FetchLeads(scope.AccountIds, fromIso));
			if (want("opportunity", "opportunities") || want("support")) activities.AddRange(FetchOpportunities(scope.AccountIds, fromIso, want("opportunity", "opportunities"), want("support")));
			if (want("note", "annotations")) activities.AddRange(FetchAnnotations(scope.ActivityLookupIds, fromIso));

			return activities
				.Where(a => !string.IsNullOrEmpty(a.Id))
				.GroupBy(a => a.Id)
				.Select(g => g.OrderByDescending(i => i.CreatedOn).First())
				.OrderByDescending(i => i.CreatedOn)
				.ToList();
		}

		private List<ActivityItem> FetchEscalationScopedActivities(string fromIso, bool includeAllTypes, List<string> requestedTypes)
		{
			var activities = new List<ActivityItem>();
			var escalationActivities = FetchEscalations(new List<string>(), fromIso);
			bool want(params string[] values) => includeAllTypes || values.Any(v => requestedTypes.Contains(v, StringComparer.OrdinalIgnoreCase));
			if (want("escalation", "slc_escalations"))
			{
				activities.AddRange(escalationActivities);
			}

			var escalationIds = escalationActivities
				.Select(a => a.Id)
				.Where(id => !String.IsNullOrWhiteSpace(id))
				.Distinct(StringComparer.OrdinalIgnoreCase)
				.ToList();

			var escalationAccountById = escalationActivities
				.Where(a => !String.IsNullOrWhiteSpace(a.Id))
				.GroupBy(a => a.Id, StringComparer.OrdinalIgnoreCase)
				.ToDictionary(g => g.Key, g => g.First().Regarding ?? String.Empty, StringComparer.OrdinalIgnoreCase);

			if (want("phonecall", "phonecalls")) activities.AddRange(FetchStandardActivitiesLinkedToEscalations("phonecalls", "Phone Call", escalationIds, fromIso, escalationAccountById));
			if (want("appointment", "appointments")) activities.AddRange(FetchStandardActivitiesLinkedToEscalations("appointments", "Appointment", escalationIds, fromIso, escalationAccountById));
			if (want("email", "emails")) activities.AddRange(FetchStandardActivitiesLinkedToEscalations("emails", "Email", escalationIds, fromIso, escalationAccountById));
			if (want("note", "annotations")) activities.AddRange(FetchAnnotationsLinkedToEscalations(escalationIds, fromIso, escalationAccountById));

			engine?.GenerateInformation($"[NotifySubscribers] Escalation scope requested types: {(includeAllTypes ? "all" : string.Join(", ", requestedTypes ?? new List<string>()))}. Found {activities.Count} raw item(s).");

			return activities
				.Where(a => !string.IsNullOrEmpty(a.Id))
				.GroupBy(a => a.Id)
				.Select(g => g.OrderByDescending(i => i.CreatedOn).First())
				.OrderByDescending(i => i.CreatedOn)
				.ToList();
		}

		private ScopeContext ResolveScopeContext(string scopeType, string scopeValue)
		{
			var accountIds = new List<string>();
			var normalizedScopeType = (scopeType ?? string.Empty).ToLowerInvariant();
			switch (normalizedScopeType)
			{
				case "account":
					if (!string.IsNullOrWhiteSpace(scopeValue)) accountIds.Add(scopeValue.Trim());
					break;
				case "country":
					accountIds = QueryAccountIdsForTextField("address1_country", scopeValue);
					break;
				case "region":
					accountIds = QueryAccountIdsForTextField("address1_stateorprovince", scopeValue);
					break;
				case "escalation":
					break;
				default:
					break;
			}

			var activityLookupIds = ExpandRelatedLookupIds(accountIds);
			engine?.GenerateInformation($"[NotifySubscribers] Scope resolution for {normalizedScopeType}:{scopeValue} -> accounts={accountIds.Count}, lookupIds={activityLookupIds.Count}.");
			return new ScopeContext
			{
				AccountIds = accountIds,
				ActivityLookupIds = activityLookupIds,
			};
		}

		private List<string> QueryAccountIds(string filter)
		{
			var rows = DataverseGetAllValues($"/accounts?$select=accountid&$filter={filter}", 20);
			return rows
				.Select(v => v["accountid"]?.Value<string>())
				.Where(v => !String.IsNullOrWhiteSpace(v))
				.Distinct(StringComparer.OrdinalIgnoreCase)
				.ToList();
		}

		private List<string> QueryAccountIdsForTextField(string fieldName, string scopeValue)
		{
			var escaped = EscapeODataString(scopeValue).Trim();
			if (String.IsNullOrWhiteSpace(escaped))
			{
				return new List<string>();
			}

			var exact = QueryAccountIds($"{fieldName} eq '{escaped}'");
			// UI suggestions use contains(); union both to avoid missing near-match values.
			var contains = QueryAccountIds($"contains({fieldName},'{escaped}')");
			var union = exact
				.Concat(contains)
				.Where(v => !String.IsNullOrWhiteSpace(v))
				.Distinct(StringComparer.OrdinalIgnoreCase)
				.ToList();
			engine?.GenerateInformation($"[NotifySubscribers] Scope text match for {fieldName}='{escaped}': exact={exact.Count}, contains={contains.Count}, union={union.Count}.");
			return union;
		}

		private List<string> ExpandRelatedLookupIds(List<string> accountIds)
		{
			var ids = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
			foreach (var id in accountIds.Where(id => !string.IsNullOrWhiteSpace(id)))
			{
				ids.Add(id);
			}

			if (accountIds == null || accountIds.Count == 0)
			{
				return new List<string>();
			}

			var capped = accountIds.Where(id => !string.IsNullOrWhiteSpace(id)).Take(50).ToList();
			var accountFilter = BuildOrFilter("_parentaccountid_value", capped);
			var parentCustomerFilter = BuildOrFilter("_parentcustomerid_value", capped);
			var regardingFilter = BuildOrFilter("_regardingobjectid_value", capped);

			AddIdsFromQuery(ids, $"/opportunities?$select=opportunityid&$filter={accountFilter}&$top=200", "opportunityid");
			AddIdsFromQuery(ids, $"/contacts?$select=contactid&$filter={parentCustomerFilter}&$top=200", "contactid");
			AddIdsFromQuery(ids, $"/leads?$select=leadid&$filter={accountFilter}&$top=200", "leadid");
			AddIdsFromQuery(ids, $"/slc_escalations?$select=activityid&$filter={regardingFilter}&$top=200", "activityid");

			// Include direct activities so notes linked to those activity records can also be matched in-scope.
			AddIdsFromQuery(ids, $"/phonecalls?$select=activityid&$filter={regardingFilter}&$top=200", "activityid");
			AddIdsFromQuery(ids, $"/appointments?$select=activityid&$filter={regardingFilter}&$top=200", "activityid");
			AddIdsFromQuery(ids, $"/emails?$select=activityid&$filter={regardingFilter}&$top=200", "activityid");

			return ids.ToList();
		}

		private void AddIdsFromQuery(HashSet<string> ids, string relativePath, string idField)
		{
			var json = DataverseGet(relativePath);
			foreach (var v in json["value"] ?? new JArray())
			{
				var id = v[idField]?.Value<string>();
				if (!String.IsNullOrWhiteSpace(id))
				{
					ids.Add(id);
				}
			}
		}

		private static string BuildOrFilter(string fieldName, List<string> ids)
		{
			var valid = ids.Where(id => !string.IsNullOrWhiteSpace(id)).ToList();
			if (valid.Count == 0)
			{
				return "false";
			}

			return "(" + string.Join(" or ", valid.Select(id => $"{fieldName} eq {id}")) + ")";
		}

		private static string BuildCreatedOnLowerBound(DateTime since)
		{
			// Dataverse does not reliably handle DateTime.MinValue in OData filters.
			// First-run should not enforce a lower bound.
			var safeMinimum = new DateTime(1753, 1, 1, 0, 0, 0, DateTimeKind.Utc);
			if (since <= safeMinimum) return null;
			return since.ToUniversalTime().ToString("o", CultureInfo.InvariantCulture);
		}

		private List<ActivityItem> FetchStandardActivities(string entitySet, string typeLabel, string lookupField, List<string> accountIds, string fromIso)
		{
			var filters = BuildLookupFilters(lookupField, accountIds);
			if (!string.IsNullOrEmpty(fromIso))
			{
				filters.Add($"createdon gt {fromIso}");
			}
			var filter = filters.Count > 0 ? "&$filter=" + string.Join(" and ", filters) : string.Empty;
			var json = DataverseGet($"/{entitySet}?$select=activityid,subject,description,createdon,_regardingobjectid_value{filter}&$orderby=createdon desc&$top=100");

			return json["value"]?.Select(v => new ActivityItem
			{
				Id = v["activityid"]?.Value<string>(),
				EntityType = entitySet,
				TypeLabel = typeLabel,
				Subject = v["subject"]?.Value<string>(),
				Description = v["description"]?.Value<string>(),
				CreatedOn = ParseDateTime(v["createdon"]?.Value<string>()) ?? DateTime.MinValue,
				RegardingId = v["_regardingobjectid_value"]?.Value<string>(),
				Regarding = v["_regardingobjectid_value@OData.Community.Display.V1.FormattedValue"]?.Value<string>(),
			}).ToList() ?? new List<ActivityItem>();
		}

		private List<ActivityItem> FetchStandardActivitiesLinkedToEscalations(string entitySet, string typeLabel, List<string> escalationIds, string fromIso, Dictionary<string, string> escalationAccountById)
		{
			var filters = new List<string>();
			if (!string.IsNullOrEmpty(fromIso))
			{
				filters.Add($"createdon gt {fromIso}");
			}

			var filter = filters.Count > 0 ? "&$filter=" + string.Join(" and ", filters) : string.Empty;
			var values = DataverseGetAllValues($"/{entitySet}?$select=activityid,subject,description,createdon,_regardingobjectid_value{filter}&$orderby=createdon desc", 20);
			var result = new List<ActivityItem>();

			foreach (var v in values)
			{
				var regardingId = v["_regardingobjectid_value"]?.Value<string>();
				var regardingLogicalName = v["_regardingobjectid_value@Microsoft.Dynamics.CRM.lookuplogicalname"]?.Value<string>();
				var description = v["description"]?.Value<string>();
				var linkedByLookup = String.Equals(regardingLogicalName, "slc_escalation", StringComparison.OrdinalIgnoreCase);
				var linkedByKnownId = !String.IsNullOrWhiteSpace(regardingId) && escalationIds.Any(id => String.Equals(id, regardingId, StringComparison.OrdinalIgnoreCase));
				var linkedByText = !String.IsNullOrWhiteSpace(description) && description.TrimStart().StartsWith("[Linked to escalation]", StringComparison.OrdinalIgnoreCase);
				if (!linkedByLookup && !linkedByKnownId && !linkedByText)
				{
					continue;
				}

				var item = new ActivityItem
				{
					Id = v["activityid"]?.Value<string>(),
					EntityType = entitySet,
					TypeLabel = typeLabel,
					Subject = v["subject"]?.Value<string>(),
					Description = description,
					CreatedOn = ParseDateTime(v["createdon"]?.Value<string>()) ?? DateTime.MinValue,
					RegardingId = regardingId,
					Regarding = v["_regardingobjectid_value@OData.Community.Display.V1.FormattedValue"]?.Value<string>(),
				};

				if (!String.IsNullOrWhiteSpace(item.RegardingId) && escalationAccountById.TryGetValue(item.RegardingId, out var escalationAccount))
				{
					item.Regarding = escalationAccount;
				}

				result.Add(item);
			}

			engine?.GenerateInformation($"[NotifySubscribers] Escalation link filter for {entitySet}: fetched {values.Count} row(s), matched {result.Count} escalation-linked row(s).");

			return result;
		}

		private List<ActivityItem> FetchEscalations(List<string> accountIds, string fromIso)
		{
			var filters = BuildLookupFilters("_regardingobjectid_value", accountIds);
			if (!string.IsNullOrEmpty(fromIso))
			{
				filters.Add($"createdon gt {fromIso}");
			}
			var filter = filters.Count > 0 ? "&$filter=" + string.Join(" and ", filters) : string.Empty;
			var json = DataverseGet($"/slc_escalations?$select=activityid,subject,description,createdon,_regardingobjectid_value{filter}&$orderby=createdon desc&$top=100");

			return json["value"]?.Select(v => new ActivityItem
			{
				Id = v["activityid"]?.Value<string>(),
				EntityType = "slc_escalations",
				TypeLabel = "Escalation",
				Subject = v["subject"]?.Value<string>(),
				Description = v["description"]?.Value<string>(),
				CreatedOn = ParseDateTime(v["createdon"]?.Value<string>()) ?? DateTime.MinValue,
				RegardingId = v["_regardingobjectid_value"]?.Value<string>(),
				Regarding = v["_regardingobjectid_value@OData.Community.Display.V1.FormattedValue"]?.Value<string>(),
			}).ToList() ?? new List<ActivityItem>();
		}

		private List<ActivityItem> FetchLeads(List<string> accountIds, string fromIso)
		{
			if (accountIds.Count == 0) return new List<ActivityItem>();
			var parentFilter = "(" + string.Join(" or ", accountIds.Select(id => $"_parentaccountid_value eq {id}")) + ")";
			var lowerBound = !string.IsNullOrEmpty(fromIso) ? $" and createdon gt {fromIso}" : string.Empty;
			var json = DataverseGet($"/leads?$select=leadid,subject,description,createdon,_parentaccountid_value&$filter={parentFilter}{lowerBound}&$orderby=createdon desc&$top=100");

			return json["value"]?.Select(v => new ActivityItem
			{
				Id = v["leadid"]?.Value<string>(),
				EntityType = "leads",
				TypeLabel = "Lead",
				Subject = v["subject"]?.Value<string>(),
				Description = v["description"]?.Value<string>(),
				CreatedOn = ParseDateTime(v["createdon"]?.Value<string>()) ?? DateTime.MinValue,
				Regarding = v["_parentaccountid_value@OData.Community.Display.V1.FormattedValue"]?.Value<string>(),
			}).ToList() ?? new List<ActivityItem>();
		}

		private List<ActivityItem> FetchOpportunities(List<string> accountIds, string fromIso, bool includeOpportunity, bool includeSupport)
		{
			if (accountIds.Count == 0) return new List<ActivityItem>();
			var parentFilter = "(" + string.Join(" or ", accountIds.Select(id => $"_parentaccountid_value eq {id}")) + ")";
			var lowerBound = !string.IsNullOrEmpty(fromIso) ? $" and createdon gt {fromIso}" : string.Empty;
			var json = DataverseGet($"/opportunities?$select=opportunityid,name,description,createdon,_parentaccountid_value,slc_opportunitytype&$filter={parentFilter}{lowerBound}&$orderby=createdon desc&$top=100");
			var result = new List<ActivityItem>();
			foreach (var v in json["value"] ?? new JArray())
			{
				var formattedType = (v["slc_opportunitytype@OData.Community.Display.V1.FormattedValue"]?.Value<string>() ?? string.Empty).ToLowerInvariant();
				var isSupport = formattedType == "renewal";
				if (isSupport && !includeSupport) continue;
				if (!isSupport && !includeOpportunity) continue;
				result.Add(new ActivityItem
				{
					Id = v["opportunityid"]?.Value<string>(),
					EntityType = isSupport ? "support" : "opportunities",
					TypeLabel = isSupport ? "Support" : "Opportunity",
					Subject = v["name"]?.Value<string>(),
					Description = v["description"]?.Value<string>(),
					CreatedOn = ParseDateTime(v["createdon"]?.Value<string>()) ?? DateTime.MinValue,
					Regarding = v["_parentaccountid_value@OData.Community.Display.V1.FormattedValue"]?.Value<string>(),
				});
			}

			return result;
		}

		private List<ActivityItem> FetchAnnotations(List<string> accountIds, string fromIso)
		{
			var filters = BuildLookupFilters("_objectid_value", accountIds);
			if (!string.IsNullOrEmpty(fromIso))
			{
				filters.Add($"createdon gt {fromIso}");
			}
			var filter = filters.Count > 0 ? "&$filter=" + string.Join(" and ", filters) : string.Empty;
			var json = DataverseGet($"/annotations?$select=annotationid,subject,notetext,createdon,_objectid_value{filter}&$orderby=createdon desc&$top=100");

			return json["value"]?.Select(v => new ActivityItem
			{
				Id = v["annotationid"]?.Value<string>(),
				EntityType = "annotations",
				TypeLabel = "Note",
				Subject = v["subject"]?.Value<string>(),
				Description = v["notetext"]?.Value<string>(),
				CreatedOn = ParseDateTime(v["createdon"]?.Value<string>()) ?? DateTime.MinValue,
				RegardingId = v["_objectid_value"]?.Value<string>(),
				Regarding = v["_objectid_value@OData.Community.Display.V1.FormattedValue"]?.Value<string>(),
			}).ToList() ?? new List<ActivityItem>();
		}

		private List<ActivityItem> FetchAnnotationsLinkedToEscalations(List<string> escalationIds, string fromIso, Dictionary<string, string> escalationAccountById)
		{
			var filters = new List<string>();
			if (!string.IsNullOrEmpty(fromIso))
			{
				filters.Add($"createdon gt {fromIso}");
			}

			var filter = filters.Count > 0 ? "&$filter=" + string.Join(" and ", filters) : string.Empty;
			var values = DataverseGetAllValues($"/annotations?$select=annotationid,subject,notetext,createdon,_objectid_value{filter}&$orderby=createdon desc", 20);
			var result = new List<ActivityItem>();

			foreach (var v in values)
			{
				var regardingId = v["_objectid_value"]?.Value<string>();
				var regardingLogicalName = v["_objectid_value@Microsoft.Dynamics.CRM.lookuplogicalname"]?.Value<string>();
				var linkedByLookup = String.Equals(regardingLogicalName, "slc_escalation", StringComparison.OrdinalIgnoreCase);
				var linkedByKnownId = !String.IsNullOrWhiteSpace(regardingId) && escalationIds.Any(id => String.Equals(id, regardingId, StringComparison.OrdinalIgnoreCase));
				if (!linkedByLookup && !linkedByKnownId)
				{
					continue;
				}

				var item = new ActivityItem
				{
					Id = v["annotationid"]?.Value<string>(),
					EntityType = "annotations",
					TypeLabel = "Note",
					Subject = v["subject"]?.Value<string>(),
					Description = v["notetext"]?.Value<string>(),
					CreatedOn = ParseDateTime(v["createdon"]?.Value<string>()) ?? DateTime.MinValue,
					RegardingId = regardingId,
					Regarding = v["_objectid_value@OData.Community.Display.V1.FormattedValue"]?.Value<string>(),
				};

				if (!String.IsNullOrWhiteSpace(item.RegardingId) && escalationAccountById.TryGetValue(item.RegardingId, out var escalationAccount))
				{
					item.Regarding = escalationAccount;
				}

				result.Add(item);
			}

			engine?.GenerateInformation($"[NotifySubscribers] Escalation link filter for annotations: fetched {values.Count} row(s), matched {result.Count} escalation-linked row(s).");

			return result;
		}

		private List<string> BuildLookupFilters(string fieldName, List<string> ids)
		{
			if (ids == null || ids.Count == 0) return new List<string>();
			return new List<string> { "(" + string.Join(" or ", ids.Select(id => $"{fieldName} eq {id}")) + ")" };
		}

		private JObject DataverseGet(string relativePath)
		{
			return DataverseGetInternal($"{DataverseBaseUrl}/api/data/v9.2{relativePath}", relativePath);
		}

		private List<JToken> DataverseGetAllValues(string relativePath, int maxPages)
		{
			var results = new List<JToken>();
			var nextUrl = $"{DataverseBaseUrl}/api/data/v9.2{relativePath}";
			var page = 0;

			while (!String.IsNullOrWhiteSpace(nextUrl) && page < maxPages)
			{
				var json = DataverseGetInternal(nextUrl, $"{relativePath} (page {page + 1})");
				foreach (var row in json["value"] ?? new JArray())
				{
					results.Add(row);
				}

				nextUrl = json["@odata.nextLink"]?.Value<string>();
				page++;
			}

			return results;
		}

		private JObject DataverseGetInternal(string url, string requestLabel)
		{
			var request = new HttpRequestMessage(HttpMethod.Get, url);
			request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
			request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
			request.Headers.Add("OData-MaxVersion", "4.0");
			request.Headers.Add("OData-Version", "4.0");
			request.Headers.Add("Prefer", "odata.include-annotations=\"OData.Community.Display.V1.FormattedValue,Microsoft.Dynamics.CRM.lookuplogicalname\",odata.maxpagesize=100");

			var response = httpClient.SendAsync(request, CancellationToken.None).GetAwaiter().GetResult();
			var payload = response.Content.ReadAsStringAsync().GetAwaiter().GetResult();
			if (!response.IsSuccessStatusCode)
			{
				throw new InvalidOperationException($"Dataverse GET failed ({(int)response.StatusCode}) {requestLabel}: {payload}");
			}

			return JObject.Parse(payload);
		}

		private static string BuildEmailBody(string userName, string scopeType, string scopeValue, string scopeLabel, string activityTypesJson, DateTime since, DateTime until, List<ActivityItem> activities)
		{
			var activityTypes = ParseActivityTypes(activityTypesJson);
			var sb = new StringBuilder();
			sb.AppendLine("<!DOCTYPE html><html><head><meta charset='utf-8' />");
			sb.AppendLine("<meta name='viewport' content='width=device-width,initial-scale=1' />");
			sb.AppendLine("</head><body style='margin:0;padding:0;background:#f6f6f6;font-family:Segoe UI,Arial,sans-serif;'>");
			sb.AppendLine("<div style='max-width:640px;margin:24px auto;border:1px solid #e1e1e2;border-radius:12px;overflow:hidden;background:#fdfdfd;'>");
			sb.AppendLine("<div style='padding:24px 28px;background:#eff0f0;border-bottom:1px solid #e1e1e2;'>");
			sb.AppendLine("<div style='font-size:22px;font-weight:700;color:#151a22;'>Activity Digest</div>");
			sb.AppendLine($"<div style='margin-top:6px;color:#727579;font-size:13px;'>For {HtmlEncode(userName ?? "Subscriber")}</div>");
			sb.AppendLine("</div>");
			sb.AppendLine("<div style='padding:24px 28px;'>");
			sb.AppendLine("<div style='background:#eff0f0;border-left:3px solid #2563eb;padding:14px 16px;border-radius:0 8px 8px 0;margin-bottom:18px;color:#44484e;font-size:14px;line-height:1.5;'>");
			sb.AppendLine($"<div><strong>Scope:</strong> {HtmlEncode(scopeType)} — {HtmlEncode(scopeLabel ?? scopeValue)}</div>");
			sb.AppendLine($"<div><strong>Period:</strong> {since:yyyy-MM-dd HH:mm} UTC → {until:yyyy-MM-dd HH:mm} UTC</div>");
			sb.AppendLine($"<div><strong>New activities:</strong> {activities.Count}</div>");
			sb.AppendLine(activityTypes != null && activityTypes.Count > 0
				? $"<div><strong>Activity types:</strong> {HtmlEncode(string.Join(", ", activityTypes))}</div>"
				: "<div><strong>Activity types:</strong> All</div>");
			sb.AppendLine("</div>");
			sb.AppendLine($"<div style='margin-bottom:16px;'><a href='{HtmlEncode(ActivitiesAppUrl)}' style='display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:10px 14px;border-radius:8px;font-size:13px;font-weight:600;'>Open Dynamics Activities</a></div>");

			foreach (var item in activities)
			{
				var link = GetDynamicsUrl(item.EntityType, item.Id);
				var typeColor = GetTypeColor(item.EntityType);
				var typeLabel = GetTypeBadgeLabel(item);

				sb.AppendLine("<div style='border:1px solid #e1e1e2;border-radius:10px;padding:14px 14px 12px 14px;margin-bottom:12px;background:#fdfdfd;'>");
				sb.AppendLine("<div style='margin-bottom:8px;'>");
				sb.AppendLine($"<span style='display:inline-block;background:{typeColor}22;color:{typeColor};padding:3px 10px;border-radius:12px;font-size:12px;font-weight:600;'>{HtmlEncode(typeLabel)}</span>");
				sb.AppendLine($"<span style='color:#727579;font-size:12px;margin-left:10px;'>{item.CreatedOn:yyyy-MM-dd HH:mm} UTC</span>");
				sb.AppendLine("</div>");
				sb.AppendLine($"<div style='font-weight:600;color:#151a22;margin-bottom:4px;'>{HtmlEncode(item.Subject ?? "(No subject)")}</div>");
				sb.AppendLine($"<div style='color:#727579;font-size:13px;margin-bottom:10px;'>Regarding: {HtmlEncode(item.Regarding)}</div>");
				if (!string.IsNullOrWhiteSpace(item.Description))
				{
					sb.AppendLine($"<div style='color:#555;font-size:13px;line-height:1.5;margin-bottom:10px;white-space:pre-wrap;'>{HtmlEncode(TrimForEmail(item.Description, 400))}</div>");
				}
				sb.AppendLine("<div style='display:flex;gap:8px;flex-wrap:wrap;'>");
				sb.AppendLine($"<a href='{HtmlEncode(link)}' style='color:#2563eb;font-size:12px;text-decoration:none;border:1px solid #2563eb;padding:5px 12px;border-radius:6px;'>View in Dynamics ↗</a>");
				sb.AppendLine($"<a href='{HtmlEncode(ActivitiesAppUrl)}?activity={HtmlEncode(item.Id)}' style='color:#2563eb;font-size:12px;text-decoration:none;border:1px solid #2563eb;padding:5px 12px;border-radius:6px;'>Open in Activities app</a>");
				sb.AppendLine("</div>");
				sb.AppendLine("</div>");
			}

			sb.AppendLine("<div style='margin-top:16px;color:#666;font-size:12px;line-height:1.5;'>You only receive entries newer than your previous digest for this subscription.</div>");
			sb.AppendLine("</div>");
			sb.AppendLine("<div style='padding:14px 28px;border-top:1px solid #e1e1e2;font-size:11px;color:#727579;text-align:center;'>");
			sb.AppendLine("You are receiving this because you subscribed to activity notifications in Dynamics Activities.<br/>");
			sb.AppendLine($"<a href='{HtmlEncode(ActivitiesAppUrl)}?tab=subscriptions' style='color:#2563eb;text-decoration:none;'>Manage subscriptions</a>");
			sb.AppendLine("</div></div></body></html>");
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
			if (DateTime.TryParse(iso, null, DateTimeStyles.RoundtripKind, out var dt)) return dt;
			return null;
		}

		private static DateTime GetEffectiveSince(DateTime lastSentAt, DateTime? createdAt)
		{
			if (!createdAt.HasValue)
			{
				return lastSentAt;
			}

			return createdAt.Value > lastSentAt ? createdAt.Value : lastSentAt;
		}

		private static DateTime? GetSubscriptionCreatedAt(DomInstance instance)
		{
			if (instance == null) return null;

			var candidatePropertyNames = new[]
			{
				"CreatedAt",
				"CreatedOn",
				"CreationTime",
				"CreatedDate",
				"CreatedUtc",
			};

			foreach (var propertyName in candidatePropertyNames)
			{
				var property = instance.GetType().GetProperty(propertyName, BindingFlags.Instance | BindingFlags.Public | BindingFlags.IgnoreCase);
				if (property == null) continue;

				var value = property.GetValue(instance, null);
				var parsed = TryConvertToUtcDateTime(value);
				if (parsed.HasValue)
				{
					return parsed.Value;
				}
			}

			return null;
		}

		private static DateTime? TryConvertToUtcDateTime(object value)
		{
			if (value == null) return null;

			if (value is DateTimeOffset dto)
			{
				return dto.UtcDateTime;
			}

			if (value is DateTime dt)
			{
				return dt.Kind == DateTimeKind.Utc ? dt : dt.ToUniversalTime();
			}

			var raw = Convert.ToString(value, CultureInfo.InvariantCulture);
			if (String.IsNullOrWhiteSpace(raw)) return null;

			if (DateTimeOffset.TryParse(raw, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out var parsedOffset))
			{
				return parsedOffset.UtcDateTime;
			}

			if (DateTime.TryParse(raw, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out var parsedDateTime))
			{
				return parsedDateTime.Kind == DateTimeKind.Utc ? parsedDateTime : parsedDateTime.ToUniversalTime();
			}

			return null;
		}

		private static List<string> ParseActivityTypes(string json)
		{
			if (string.IsNullOrEmpty(json)) return null;
			try
			{
				var values = JsonConvert.DeserializeObject<List<string>>(json);
				if (values == null) return null;

				string normalize(string value)
				{
					var key = (value ?? String.Empty).Trim().ToLowerInvariant();
					switch (key)
					{
						case "phonecall":
						case "phonecalls":
							return "phonecalls";
						case "appointment":
						case "appointments":
							return "appointments";
						case "email":
						case "emails":
							return "emails";
						case "escalation":
						case "slc_escalation":
						case "slc_escalations":
							return "slc_escalations";
						case "annotation":
						case "annotations":
						case "note":
							return "annotations";
						case "lead":
						case "leads":
							return "leads";
						case "opportunity":
						case "opportunities":
							return "opportunities";
						case "support":
							return "support";
						default:
							return null;
					}
				}

				return values
					.Select(normalize)
					.Where(v => !String.IsNullOrWhiteSpace(v))
					.Distinct(StringComparer.OrdinalIgnoreCase)
					.ToList();
			}
			catch { return null; }
		}

		private static string EscapeODataString(string input)
		{
			return (input ?? string.Empty).Replace("'", "''");
		}

		private static string HtmlEncode(string value)
		{
			if (string.IsNullOrEmpty(value)) return string.Empty;
			return value.Replace("&", "&amp;").Replace("<", "&lt;").Replace(">", "&gt;").Replace("\"", "&quot;").Replace("'", "&#39;");
		}

		private static string TrimForEmail(string value, int max)
		{
			if (string.IsNullOrEmpty(value) || value.Length <= max) return value;
			return value.Substring(0, max) + "...";
		}

		private static string GetTypeColor(string entityType)
		{
			switch ((entityType ?? string.Empty).ToLowerInvariant())
			{
				case "phonecalls":
					return "#24A148";
				case "appointments":
					return "#2563EB";
				case "slc_escalations":
					return "#DA1E28";
				case "annotations":
					return "#F1C21B";
				case "emails":
					return "#8A3FFC";
				default:
					return "#FB923C";
			}
		}

		private static string GetTypeBadgeLabel(ActivityItem item)
		{
			var entityType = (item.EntityType ?? string.Empty).ToLowerInvariant();
			switch (entityType)
			{
				case "phonecalls":
					return "Phone Call";
				case "appointments":
					return "Appointment";
				case "slc_escalations":
					return "Escalation";
				case "annotations":
					return "Note";
				case "emails":
					return "Email";
				case "leads":
					return "Lead";
				case "opportunities":
					return "Opportunity";
				case "support":
					return "Support";
				default:
					return item.TypeLabel ?? "Activity";
			}
		}

		private static string GetDynamicsUrl(string entityType, string activityId)
		{
			var etn = "activitypointer";
			switch ((entityType ?? string.Empty).ToLowerInvariant())
			{
				case "phonecalls":
					etn = "phonecall";
					break;
				case "appointments":
					etn = "appointment";
					break;
				case "emails":
					etn = "email";
					break;
				case "slc_escalations":
					etn = "slc_escalation";
					break;
				case "annotations":
					etn = "annotation";
					break;
				case "leads":
					etn = "lead";
					break;
				case "opportunities":
				case "support":
					etn = "opportunity";
					break;
			}

			return $"{DataverseBaseUrl}/main.aspx?etn={etn}&id={activityId}&pagetype=entityrecord";
		}

		private sealed class ActivityItem
		{
			public string Id { get; set; }
			public string EntityType { get; set; }
			public string TypeLabel { get; set; }
			public string Subject { get; set; }
			public string Description { get; set; }
			public string RegardingId { get; set; }
			public string Regarding { get; set; }
			public DateTime CreatedOn { get; set; }
		}

		private sealed class ScopeContext
		{
			public List<string> AccountIds { get; set; } = new List<string>();
			public List<string> ActivityLookupIds { get; set; } = new List<string>();
		}
	}
}
