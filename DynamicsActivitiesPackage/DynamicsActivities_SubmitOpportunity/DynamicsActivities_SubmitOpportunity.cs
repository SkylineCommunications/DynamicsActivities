namespace DynamicsActivitiesSubmitOpportunity
{
	using System;
	using System.Net;
	using System.Text;
	using Newtonsoft.Json.Linq;
	using Skyline.DataMiner.Automation;

	/// <summary>
	/// Receives an opportunity submitted from the Dynamics Activities web app and emails
	/// it to the configured recipient. Called by the frontend via ExecuteAutomationScript.
	/// Parameters: Payload (JSON opportunity fields), UserEmail, UserName, Recipient (optional override).
	/// </summary>
	public class Script
	{
		// Default recipient. Override at runtime with the "Recipient" script parameter.
		private const string DefaultRecipient = "loes.vervaele@skyline.be";

		/// <summary>
		/// Entry point invoked by the DataMiner Automation engine.
		/// </summary>
		/// <param name="engine">The automation engine.</param>
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
			var payloadRaw = engine.GetScriptParam("Payload")?.Value?.Trim();
			var userEmail = engine.GetScriptParam("UserEmail")?.Value?.Trim() ?? string.Empty;
			var userName = engine.GetScriptParam("UserName")?.Value?.Trim() ?? string.Empty;
			var recipient = engine.GetScriptParam("Recipient")?.Value?.Trim();
			if (string.IsNullOrWhiteSpace(recipient))
			{
				recipient = DefaultRecipient;
			}

			if (string.IsNullOrWhiteSpace(payloadRaw))
			{
				engine.ExitFail("Missing opportunity payload.");
				return;
			}

			JObject opportunity;
			try
			{
				opportunity = JObject.Parse(payloadRaw);
			}
			catch (Exception ex)
			{
				engine.ExitFail("Invalid opportunity payload JSON: " + ex.Message);
				return;
			}

			var validationError = Validate(opportunity);
			if (validationError != null)
			{
				engine.AddScriptOutput("result", BuildErrorResult(validationError));
				return;
			}

			var subject = BuildSubject(opportunity);
			var body = BuildEmailBody(opportunity, userName, userEmail);

			engine.SendEmail(body, subject, recipient);
			engine.GenerateInformation($"[SubmitOpportunity] Opportunity email sent to {recipient} (submitted by {userName} <{userEmail}>).");

			engine.AddScriptOutput("result", "{\"success\":true}");
		}

		private static string Validate(JObject opportunity)
		{
			if (string.IsNullOrWhiteSpace(Field(opportunity, "topic")))
			{
				return "Opportunity name is required.";
			}

			if (string.IsNullOrWhiteSpace(Field(opportunity, "company")))
			{
				return "Company is required.";
			}

			var email = Field(opportunity, "email");
			if (!string.IsNullOrWhiteSpace(email) && !IsValidEmail(email))
			{
				return "The email address is not valid.";
			}

			return null;
		}

		private static bool IsValidEmail(string value)
		{
			if (string.IsNullOrWhiteSpace(value))
			{
				return false;
			}

			var at = value.IndexOf('@');
			if (at <= 0 || at != value.LastIndexOf('@') || at >= value.Length - 1)
			{
				return false;
			}

			var dot = value.IndexOf('.', at);
			return dot > at + 1 && dot < value.Length - 1;
		}

		private static string BuildErrorResult(string message)
		{
			return new JObject
			{
				["success"] = false,
				["error"] = message,
			}.ToString(Newtonsoft.Json.Formatting.None);
		}

		private static string BuildSubject(JObject opportunity)
		{
			var topic = Field(opportunity, "topic");
			var company = Field(opportunity, "company");
			var who = !string.IsNullOrWhiteSpace(topic) ? topic : "Untitled opportunity";
			if (!string.IsNullOrWhiteSpace(company))
			{
				who = $"{who} ({company})";
			}

			return $"[New Opportunity] {who}";
		}

		private static string BuildEmailBody(JObject opportunity, string submitterName, string submitterEmail)
		{
			var sb = new StringBuilder();
			sb.AppendLine("<!DOCTYPE html><html><head><meta charset='utf-8' />");
			sb.AppendLine("<meta name='viewport' content='width=device-width,initial-scale=1' />");
			sb.AppendLine("</head><body style='margin:0;padding:0;background:#f6f6f6;font-family:Segoe UI,Arial,sans-serif;'>");
			sb.AppendLine("<div style='max-width:640px;margin:24px auto;border:1px solid #e1e1e2;border-radius:12px;overflow:hidden;background:#fdfdfd;'>");
			sb.AppendLine("<div style='padding:24px 28px;background:#eff0f0;border-bottom:1px solid #e1e1e2;'>");
			sb.AppendLine("<div style='font-size:22px;font-weight:700;color:#151a22;'>New Opportunity</div>");
			sb.AppendLine("<div style='margin-top:6px;color:#727579;font-size:13px;'>Submitted via the Dynamics Activities app</div>");
			sb.AppendLine("</div>");
			sb.AppendLine("<div style='padding:24px 28px;'>");
			sb.AppendLine("<table style='width:100%;border-collapse:collapse;font-size:14px;color:#1f2937;'>");

			AppendRow(sb, "Opportunity name", Field(opportunity, "topic"));
			AppendRow(sb, "Company / Account", Field(opportunity, "company"));
			AppendRow(sb, "Estimated value", Field(opportunity, "estimatedValue"));
			AppendRow(sb, "Estimated close date", Field(opportunity, "estimatedCloseDate"));
			AppendRow(sb, "Contact first name", Field(opportunity, "firstName"));
			AppendRow(sb, "Contact last name", Field(opportunity, "lastName"));
			AppendRow(sb, "Email", Field(opportunity, "email"));
			AppendRow(sb, "Phone", Field(opportunity, "phone"));
			AppendRow(sb, "Country", Field(opportunity, "country"));
			AppendRow(sb, "Description", Field(opportunity, "description"));

			sb.AppendLine("</table>");

			var submitter = HtmlEncode(string.IsNullOrWhiteSpace(submitterName) ? submitterEmail : submitterName);
			if (!string.IsNullOrWhiteSpace(submitter))
			{
				var contact = string.IsNullOrWhiteSpace(submitterEmail) ? submitter : $"{submitter} &lt;{HtmlEncode(submitterEmail)}&gt;";
				sb.AppendLine($"<div style='margin-top:20px;padding-top:14px;border-top:1px solid #e1e1e2;color:#727579;font-size:12px;'>Submitted by {contact}</div>");
			}

			sb.AppendLine("</div></div></body></html>");
			return sb.ToString();
		}

		private static void AppendRow(StringBuilder sb, string label, string value)
		{
			if (string.IsNullOrWhiteSpace(value))
			{
				return;
			}

			sb.AppendLine("<tr>");
			sb.AppendLine($"<td style='padding:8px 12px 8px 0;vertical-align:top;color:#727579;font-weight:600;white-space:nowrap;'>{HtmlEncode(label)}</td>");
			sb.AppendLine($"<td style='padding:8px 0;vertical-align:top;'>{HtmlEncode(value).Replace("\n", "<br />")}</td>");
			sb.AppendLine("</tr>");
		}

		private static string Field(JObject opportunity, string name)
		{
			return opportunity[name]?.Value<string>()?.Trim() ?? string.Empty;
		}

		private static string HtmlEncode(string value)
		{
			return string.IsNullOrEmpty(value) ? string.Empty : WebUtility.HtmlEncode(value);
		}
	}
}
