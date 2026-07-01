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
		/// Creates the Subscription section definition.
		/// </summary>
		public static CustomSectionDefinition CreateSubscriptionSectionDefinition()
		{
			var sectionDefinition = new CustomSectionDefinition
			{
				ID = new SectionDefinitionID(DomIds.Subscription.SectionDefinitionId),
				Name = "Subscription",
			};

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

			sectionDefinition.AddOrReplaceFieldDescriptor(new FieldDescriptor
			{
				ID = new FieldDescriptorID(DomIds.Subscription.AccountId),
				Name = "Account ID",
				FieldType = typeof(string),
			});

			sectionDefinition.AddOrReplaceFieldDescriptor(new FieldDescriptor
			{
				ID = new FieldDescriptorID(DomIds.Subscription.AccountName),
				Name = "Account Name",
				FieldType = typeof(string),
			});

			sectionDefinition.AddOrReplaceFieldDescriptor(new FieldDescriptor
			{
				ID = new FieldDescriptorID(DomIds.Subscription.Frequency),
				Name = "Frequency",
				FieldType = typeof(string),
			});

			sectionDefinition.AddOrReplaceFieldDescriptor(new FieldDescriptor
			{
				ID = new FieldDescriptorID(DomIds.Subscription.IsActive),
				Name = "Is Active",
				FieldType = typeof(bool),
			});

			return sectionDefinition;
		}

		/// <summary>
		/// Creates the Subscription DOM definition.
		/// Section definition linking is handled by the install script after creation.
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
