Place the Assistant integration runtime DLLs in this folder so they are copied with automation scripts:

Required file names:
- Skyline.DataMiner.Assistant.Integration.dll

Expected location:
C:\git\dynamicsactivities\DynamicsActivitiesPackage\Dependencies\Assistant\

Notes:
- Both DynamicsActivities_Summarize and DynamicsActivities_NotifySubscribers reference this DLL conditionally.
- When present, they are copied to script output (Copy Local) and shipped in the DMAPP.
- If absent, build still succeeds, but scripts will use fallback summary mode.
