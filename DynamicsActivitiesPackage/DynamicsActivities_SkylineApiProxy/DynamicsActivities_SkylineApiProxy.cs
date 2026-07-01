namespace DynamicsActivitiesSkylineApiProxy
{
	using System;
	using System.Net.Http;
	using System.Net.Http.Headers;
	using Skyline.DataMiner.Automation;

	/// <summary>
	/// Server-side proxy for the Skyline Collaboration API.
	/// Avoids CORS issues by making the HTTP call from the DMA server.
	/// Parameters: Path (API path, e.g. "api/Users/Mine"), Token (Bearer token).
	/// Returns: JSON response body via script output "result".
	/// </summary>
	public class Script
	{
		private static readonly HttpClient HttpClient = new HttpClient
		{
			BaseAddress = new Uri("https://api.skyline.be/"),
			Timeout = TimeSpan.FromSeconds(15),
		};

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
			var path = engine.GetScriptParam("Path")?.Value?.Trim() ?? string.Empty;
			var token = engine.GetScriptParam("Token")?.Value?.Trim() ?? string.Empty;

			if (string.IsNullOrEmpty(path) || string.IsNullOrEmpty(token))
			{
				engine.ExitFail("Missing Path or Token parameter");
				return;
			}

			// Sanitize path — only allow api/ prefixed paths
			if (!path.StartsWith("api/", StringComparison.OrdinalIgnoreCase))
			{
				engine.ExitFail("Invalid path — must start with api/");
				return;
			}

			using (var request = new HttpRequestMessage(HttpMethod.Get, path))
			{
				request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
				request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

				var response = HttpClient.SendAsync(request).GetAwaiter().GetResult();
				var body = response.Content.ReadAsStringAsync().GetAwaiter().GetResult();

				if (!response.IsSuccessStatusCode)
				{
					engine.ExitFail($"Skyline API returned {(int)response.StatusCode}: {body}");
					return;
				}

				engine.AddScriptOutput("result", body);
			}
		}
	}
}
