namespace DynamicsActivities.DomDefinitions
{
	using System;

	/// <summary>
	/// Central ID registry for the DynamicsActivities DOM module.
	/// All GUIDs are stable — changing them breaks existing instances.
	/// </summary>
	public static class DomIds
	{
		/// <summary>
		/// Module ID for the DynamicsActivities DOM module.
		/// </summary>
		public static readonly string ModuleId = "dynamics_activities";

		/// <summary>
		/// Section definition: Activity Subscription.
		/// Tracks user subscriptions for email notifications on account activity.
		/// </summary>
		public static class Subscription
		{
			public static readonly Guid SectionDefinitionId = new Guid("a1e2f3d4-5b6c-7d8e-9f0a-1b2c3d4e5f60");
			public static readonly Guid DomDefinitionId = new Guid("b2f3e4d5-6c7d-8e9f-0a1b-2c3d4e5f6071");

			// Field descriptors — subscriber identity
			public static readonly Guid UserEmail = new Guid("c3a4b5c6-7d8e-9f0a-1b2c-3d4e5f607182");
			public static readonly Guid UserName = new Guid("d4b5c6d7-8e9f-0a1b-2c3d-4e5f60718293");

			// Field descriptors — scope (what to watch)
			public static readonly Guid ScopeType = new Guid("e5c6d7e8-9f0a-1b2c-3d4e-5f6071829304");
			public static readonly Guid ScopeValue = new Guid("f6d7e8f9-0a1b-2c3d-4e5f-607182930415");
			public static readonly Guid ScopeLabel = new Guid("07e8f9a0-1b2c-3d4e-5f60-718293041526");

			// Field descriptors — notification settings
			public static readonly Guid Frequency = new Guid("18f9a0b1-2c3d-4e5f-6071-829304152637");
			public static readonly Guid ActivityTypes = new Guid("29a0b1c2-3d4e-5f60-7182-930415263748");
			public static readonly Guid Enabled = new Guid("3ab1c2d3-4e5f-6071-8293-041526374859");

			// Field descriptors — state tracking
			public static readonly Guid LastSentAt = new Guid("4bc2d3e4-5f60-7182-9304-15263748596a");
		}
	}
}
