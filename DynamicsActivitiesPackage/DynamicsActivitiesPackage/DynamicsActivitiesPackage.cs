using Skyline.AppInstaller;
using Skyline.DataMiner.Automation;
using Skyline.DataMiner.Net.AppPackages;
using System;

/// <summary>
/// DataMiner Script Class.
/// </summary>
internal class Script
{
    /// <summary>
    /// The script entry point.
    /// </summary>
    [AutomationEntryPoint(AutomationEntryPointType.Types.InstallAppPackage)]
    public void Install(IEngine engine, AppInstallContext context)
    {
        try
        {
            engine.Timeout = new TimeSpan(0, 10, 0);
            engine.GenerateInformation("Starting DynamicsActivities installation v1.8.5");
            var installer = new AppInstaller(Engine.SLNetRaw, context);
            installer.InstallDefaultContent();
            engine.GenerateInformation("Installation completed successfully.");
        }
        catch (Exception e)
        {
            engine.GenerateInformation($"Installation FAILED: {e}");
            engine.ExitFail($"Installation failed: {e.Message}");
        }
    }
}