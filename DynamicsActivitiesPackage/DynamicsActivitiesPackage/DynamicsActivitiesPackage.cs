using DynamicsActivities.DomDefinitions;
using Skyline.AppInstaller;
using Skyline.DataMiner.Automation;
using Skyline.DataMiner.Net.AppPackages;
using Skyline.DataMiner.Net.Apps.DataMinerObjectModel;
using Skyline.DataMiner.Net.Messages.SLDataGateway;
using Skyline.DataMiner.Net.Sections;
using System;
using System.Linq;

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
            engine.GenerateInformation("Starting DynamicsActivities installation");
            var installer = new AppInstaller(Engine.SLNetRaw, context);
            installer.InstallDefaultContent();
            engine.GenerateInformation("Default content installed.");
        }
        catch (Exception e)
        {
            engine.GenerateInformation($"Installation FAILED: {e}");
            engine.ExitFail($"Installation failed: {e.Message}");
            return;
        }

        // DOM setup is non-fatal — web app works without it
        try
        {
            SetupDomModule(engine);
        }
        catch (Exception domEx)
        {
            engine.GenerateInformation($"DOM setup failed (non-fatal, app still works): {domEx.Message}");
        }
    }

    private void SetupDomModule(IEngine engine)
    {
        engine.GenerateInformation("Setting up DynamicsActivities DOM module...");
        var domHelper = new DomHelper(engine.SendSLNetMessages, DomIds.ModuleId);

        EnsureSubscriptionSectionDefinition(engine, domHelper);
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