#define SourceDir GetEnv('SOURCEBOOK_WINDOWS_SOURCE')
#define OutputDir GetEnv('SOURCEBOOK_WINDOWS_OUTPUT')

[Setup]
AppId={{C9270882-4FC0-495D-BC0D-CB54C780B3E4}
AppName=Sourcebook for Agents
AppVersion=0.1.0
DefaultDirName={autopf}\Sourcebook for Agents
DefaultGroupName=Sourcebook for Agents
DisableProgramGroupPage=yes
OutputBaseFilename=Sourcebook-for-Agents-Setup
OutputDir={#OutputDir}
Compression=lzma
SolidCompression=yes
WizardStyle=modern

[Files]
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: recursesubdirs ignoreversion

[Icons]
Name: "{autoprograms}\Sourcebook for Agents"; Filename: "{app}\Sourcebook Desktop.vbs"
Name: "{autodesktop}\Sourcebook for Agents"; Filename: "{app}\Sourcebook Desktop.vbs"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Additional shortcuts:"; Flags: unchecked

[Run]
; A .vbs file must be launched through the Windows Script Host. Executing it
; directly makes Inno Setup call CreateProcess on a non-executable file.
Filename: "{sys}\wscript.exe"; Parameters: """{app}\Sourcebook Desktop.vbs"""; Description: "Open Sourcebook for Agents"; Flags: nowait postinstall skipifsilent
