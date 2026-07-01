namespace DynamicsActivities.DomDefinitions
{
	using Skyline.DataMiner.Net.Apps.DataMinerObjectModel;
	using Skyline.DataMiner.Net.Sections;

	/// <summary>
	/// Factory that creates the DynamicsActivities DOM module definitions.
	/// Used by the install script to ensure definitions exist on the target system.
	/// </summary>
	public static class DomModuleFactory
	{
		/// <summary>
		/// Creates the Subscription section definition with all fields.
		/// </summary>
		public static CustomSectionDefinition CreateSubscriptionSectionDefinition()
		{
			var sectionDefinition = new CustomSectionDefinition
			{
				ID = new SectionDefinitionID(DomIds.Subscription.SectionDefinitionId),
				Name = "Subscription",
			};

			// Subscriber identity
			sectionDefinition.AddOrReplaceFieldDescriptor(new FieldDescriptor
			{
				ID = new FieldDescriptorID(DomIds.Subscription.UserEmail),
				Name = "User Email",
				FieldType = typeof(string),
			});

			sectionDefinition.AddOrReplaceFieldDescriptor(new FieldDescriptor
			{
				ID = new FieldDescriptorID(DomIds.Subscription.UserName),
				Name = "User Name",
				FieldType = typeof(string),
			});

			// Scope — what to watch
			sectionDefinition.AddOrReplaceFieldDescriptor(new FieldDescriptor
			{
				ID = new FieldDescriptorID(DomIds.Subscription.ScopeType),
				Name = "Scope Type",
				FieldType = typeof(string),
			});

			sectionDefinition.AddOrReplaceFieldDescriptor(new FieldDescriptor
			{
				ID = new FieldDescriptorID(DomIds.Subscription.ScopeValue),
				Name = "Scope Value",
				FieldType = typeof(string),
			});

			sectionDefinition.AddOrReplaceFieldDescriptor(new FieldDescriptor
			{
				ID = new FieldDescriptorID(DomIds.Subscription.ScopeLabel),
				Name = "Scope Label",
				FieldType = typeof(string),
			});

			// Notification settings
			sectionDefinition.AddOrReplaceFieldDescriptor(new FieldDescriptor
			{
				ID = new FieldDescriptorID(DomIds.Subscription.Frequency),
				Name = "Frequency",
				FieldType = typeof(string),
			});

			sectionDefinition.AddOrReplaceFieldDescriptor(new FieldDescriptor
			{
				ID = new FieldDescriptorID(DomIds.Subscription.ActivityTypes),
				Name = "Activity Types",
				FieldType = typeof(string), // JSON array: ["phonecalls","emails",...]
			});

			sectionDefinition.AddOrReplaceFieldDescriptor(new FieldDescriptor
			{
				ID = new FieldDescriptorID(DomIds.Subscription.Enabled),
				Name = "Enabled",
				FieldType = typeof(bool),
			});

			// State tracking
			sectionDefinition.AddOrReplaceFieldDescriptor(new FieldDescriptor
			{
				ID = new FieldDescriptorID(DomIds.Subscription.LastSentAt),
				Name = "Last Sent At",
				FieldType = typeof(string), // ISO 8601 timestamp
			});

			return sectionDefinition;
		}

		/// <summary>
		/// Creates the Subscription DOM definition.
		/// </summary>
		public static DomDefinition CreateSubscriptionDomDefinition()
		{
			return new DomDefinition
			{
				ID = new DomDefinitionId(DomIds.Subscription.DomDefinitionId),
				Name = "Activity Subscription",
			};
		}
	}
}
