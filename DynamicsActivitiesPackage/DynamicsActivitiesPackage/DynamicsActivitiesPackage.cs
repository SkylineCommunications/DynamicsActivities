using DynamicsActivities.DomDefinitions;
using Skyline.AppInstaller;
using Skyline.DataMiner.Automation;
using Skyline.DataMiner.Net.AppPackages;
using Skyline.DataMiner.Net.Apps.DataMinerObjectModel;
using Skyline.DataMiner.Net.Messages.SLDataGateway;
using Skyline.DataMiner.Net.Sections;
using System;
using System.IO;
using System.Linq;

/// <summary>
/// DataMiner Script Class.
/// </summary>
internal class Script
{
    private const string WebAppPath = @"C:\Skyline DataMiner\Webpages\public\DynamicsActivities";

    /// <summary>
    /// The script entry point.
    /// </summary>
    /// <param name="engine">Provides access to the Automation engine.</param>
    /// <param name="context">Provides access to the installation context.</param>
    [AutomationEntryPoint(AutomationEntryPointType.Types.InstallAppPackage)]
    public void Install(IEngine engine, AppInstallContext context)
    {
        try
        {
            engine.Timeout = new TimeSpan(0, 10, 0);
            engine.GenerateInformation("Starting installation");

            // Clean old web app files before extracting new ones
            CleanWebAppDirectory(engine);

            var installer = new AppInstaller(Engine.SLNetRaw, context);
            installer.InstallDefaultContent();

            engine.GenerateInformation("Companion files installed successfully.");

            // Set up the DOM module (non-fatal — don't roll back the install if this fails)
            try
            {
                SetupDomModule(engine);
            }
            catch (Exception domEx)
            {
                engine.GenerateInformation($"DOM setup failed (non-fatal): {domEx.Message}");
            }
        }
        catch (Exception e)
        {
            engine.ExitFail($"Exception encountered during installation: {e}");
        }
    }

    private void CleanWebAppDirectory(IEngine engine)
    {
        if (Directory.Exists(WebAppPath))
        {
            engine.GenerateInformation($"Cleaning old web app at {WebAppPath}...");
            Directory.Delete(WebAppPath, recursive: true);
            engine.GenerateInformation("Old web app removed.");
        }
    }

    private void SetupDomModule(IEngine engine)
    {
        engine.GenerateInformation("Setting up DynamicsActivities DOM module...");

        // DomHelper uses the engine's SLNet message handler
        var domHelper = new DomHelper(engine.SendSLNetMessages, DomIds.ModuleId);

        // Ensure section definitions exist
        EnsureSubscriptionSectionDefinition(engine, domHelper);

        // Ensure DOM definitions exist
        EnsureSubscriptionDomDefinition(engine, domHelper);

        engine.GenerateInformation("DOM module setup complete.");
    }

    private void EnsureSubscriptionSectionDefinition(IEngine engine, DomHelper domHelper)
    {
        var existing = domHelper.SectionDefinitions
            .Read(SectionDefinitionExposers.ID.Equal(DomIds.Subscription.SectionDefinitionId))
            .FirstOrDefault();

        if (existing == null)
        {
            engine.GenerateInformation("Creating Subscription section definition...");
            domHelper.SectionDefinitions.Create(DomModuleFactory.CreateSubscriptionSectionDefinition());
        }
        else
        {
            engine.GenerateInformation("Subscription section definition already exists, updating...");
            var updated = DomModuleFactory.CreateSubscriptionSectionDefinition();
            updated.ID = existing.GetID();
            domHelper.SectionDefinitions.Update(updated);
        }
    }

    private void EnsureSubscriptionDomDefinition(IEngine engine, DomHelper domHelper)
    {
        var existing = domHelper.DomDefinitions
            .Read(DomDefinitionExposers.Id.Equal(DomIds.Subscription.DomDefinitionId))
            .FirstOrDefault();

        if (existing == null)
        {
            engine.GenerateInformation("Creating Subscription DOM definition...");
            domHelper.DomDefinitions.Create(DomModuleFactory.CreateSubscriptionDomDefinition());
        }
        else
        {
            engine.GenerateInformation("Subscription DOM definition already exists.");
        }
    }
}