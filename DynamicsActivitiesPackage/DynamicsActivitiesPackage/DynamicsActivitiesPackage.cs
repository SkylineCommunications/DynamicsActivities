using Skyline.AppInstaller;
using Skyline.DataMiner.Automation;
using Skyline.DataMiner.Net.AppPackages;
using Skyline.DataMiner.Net.Apps.DataMinerObjectModel;
using Skyline.DataMiner.Net.Apps.Modules;
using Skyline.DataMiner.Net.Messages.SLDataGateway;
using Skyline.DataMiner.Net.Sections;
using System;
using System.Linq;

/// <summary>
/// DataMiner Script Class.
/// DOM GUIDs are inlined in each script that needs them (ManageSubscriptions,
/// NotifySubscribers, and this install script). Change one → change all three.
/// </summary>
internal class Script
{
    // DOM IDs — keep in sync across: ManageSubscriptions, NotifySubscribers, and this install script
    private const string ModuleId = "dynamics_activities";
    private static readonly Guid SectionDefinitionId = new Guid("a1e2f3d4-5b6c-7d8e-9f0a-1b2c3d4e5f60");
    private static readonly Guid DomDefinitionId = new Guid("b2f3e4d5-6c7d-8e9f-0a1b-2c3d4e5f6071");
    private static readonly Guid FieldUserEmail = new Guid("c3a4b5c6-7d8e-9f0a-1b2c-3d4e5f607182");
    private static readonly Guid FieldUserName = new Guid("d4b5c6d7-8e9f-0a1b-2c3d-4e5f60718293");
    private static readonly Guid FieldScopeType = new Guid("e5c6d7e8-9f0a-1b2c-3d4e-5f6071829304");
    private static readonly Guid FieldScopeValue = new Guid("f6d7e8f9-0a1b-2c3d-4e5f-607182930415");
    private static readonly Guid FieldScopeLabel = new Guid("07e8f9a0-1b2c-3d4e-5f60-718293041526");
    private static readonly Guid FieldFrequency = new Guid("18f9a0b1-2c3d-4e5f-6071-829304152637");
    private static readonly Guid FieldActivityTypes = new Guid("29a0b1c2-3d4e-5f60-7182-930415263748");
    private static readonly Guid FieldEnabled = new Guid("3ab1c2d3-4e5f-6071-8293-041526374859");
    private static readonly Guid FieldLastSentAt = new Guid("4bc2d3e4-5f60-7182-9304-15263748596a");

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

        // Create module settings if they don't exist (required before DomHelper can operate)
        var moduleSettingsHelper = new ModuleSettingsHelper(engine.SendSLNetMessages);
        var existingSettings = moduleSettingsHelper.ModuleSettings.Read(
            ModuleSettingsExposers.ModuleId.Equal(ModuleId)).FirstOrDefault();

        if (existingSettings == null)
        {
            engine.GenerateInformation("Creating DOM module settings...");
            var settings = new ModuleSettings(ModuleId);
            moduleSettingsHelper.ModuleSettings.Create(settings);
        }
        else
        {
            engine.GenerateInformation("DOM module settings already exist.");
        }

        var domHelper = new DomHelper(engine.SendSLNetMessages, ModuleId);

        EnsureSubscriptionSectionDefinition(engine, domHelper);
        EnsureSubscriptionDomDefinition(engine, domHelper);

        engine.GenerateInformation("DOM module setup complete.");
    }

    private void EnsureSubscriptionSectionDefinition(IEngine engine, DomHelper domHelper)
    {
        var existing = domHelper.SectionDefinitions
            .Read(SectionDefinitionExposers.ID.Equal(SectionDefinitionId))
            .FirstOrDefault();

        if (existing == null)
        {
            engine.GenerateInformation("Creating Subscription section definition...");
            domHelper.SectionDefinitions.Create(CreateSubscriptionSectionDefinition());
        }
        else
        {
            engine.GenerateInformation("Subscription section definition already exists, updating...");
            var updated = CreateSubscriptionSectionDefinition();
            updated.ID = existing.GetID();
            domHelper.SectionDefinitions.Update(updated);
        }
    }

    private void EnsureSubscriptionDomDefinition(IEngine engine, DomHelper domHelper)
    {
        var existing = domHelper.DomDefinitions
            .Read(DomDefinitionExposers.Id.Equal(DomDefinitionId))
            .FirstOrDefault();

        if (existing == null)
        {
            engine.GenerateInformation("Creating Subscription DOM definition...");
            domHelper.DomDefinitions.Create(new DomDefinition
            {
                ID = new DomDefinitionId(DomDefinitionId),
                Name = "Activity Subscription",
            });
        }
        else
        {
            engine.GenerateInformation("Subscription DOM definition already exists.");
        }
    }

    private static CustomSectionDefinition CreateSubscriptionSectionDefinition()
    {
        var section = new CustomSectionDefinition
        {
            ID = new SectionDefinitionID(SectionDefinitionId),
            Name = "Subscription",
        };

        section.AddOrReplaceFieldDescriptor(new FieldDescriptor { ID = new FieldDescriptorID(FieldUserEmail), Name = "User Email", FieldType = typeof(string) });
        section.AddOrReplaceFieldDescriptor(new FieldDescriptor { ID = new FieldDescriptorID(FieldUserName), Name = "User Name", FieldType = typeof(string) });
        section.AddOrReplaceFieldDescriptor(new FieldDescriptor { ID = new FieldDescriptorID(FieldScopeType), Name = "Scope Type", FieldType = typeof(string) });
        section.AddOrReplaceFieldDescriptor(new FieldDescriptor { ID = new FieldDescriptorID(FieldScopeValue), Name = "Scope Value", FieldType = typeof(string) });
        section.AddOrReplaceFieldDescriptor(new FieldDescriptor { ID = new FieldDescriptorID(FieldScopeLabel), Name = "Scope Label", FieldType = typeof(string) });
        section.AddOrReplaceFieldDescriptor(new FieldDescriptor { ID = new FieldDescriptorID(FieldFrequency), Name = "Frequency", FieldType = typeof(string) });
        section.AddOrReplaceFieldDescriptor(new FieldDescriptor { ID = new FieldDescriptorID(FieldActivityTypes), Name = "Activity Types", FieldType = typeof(string) });
        section.AddOrReplaceFieldDescriptor(new FieldDescriptor { ID = new FieldDescriptorID(FieldEnabled), Name = "Enabled", FieldType = typeof(bool) });
        section.AddOrReplaceFieldDescriptor(new FieldDescriptor { ID = new FieldDescriptorID(FieldLastSentAt), Name = "Last Sent At", FieldType = typeof(string) });

        return section;
    }
}