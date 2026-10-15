#define SourceDir GetEnv('SOURCEBOOK_WINDOWS_SOURCE')
#define OutputDir GetEnv('SOURCEBOOK_WINDOWS_OUTPUT')
#define AppVersion GetEnv('SOURCEBOOK_VERSION')

#if AppVersion == ""
  #define AppVersion "0.1.0"
#endif

[Setup]
AppId={{C9270882-4FC0-495D-BC0D-CB54C780B3E4}
AppName=Sourcebook for Agents
AppVersion={#AppVersion}
DefaultDirName={autopf}\Sourcebook for Agents
DefaultGroupName=Sourcebook for Agents
SetupIconFile={#SourceDir}\SourcebookDesktop.ico
UninstallDisplayIcon={app}\SourcebookDesktop.ico
DisableProgramGroupPage=yes
CloseApplications=yes
RestartApplications=no
OutputBaseFilename=Sourcebook-for-Agents-Setup
OutputDir={#OutputDir}
Compression=lzma
SolidCompression=yes
WizardStyle=modern

[Files]
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: recursesubdirs ignoreversion

[Icons]
Name: "{autoprograms}\Sourcebook for Agents"; Filename: "{app}\Sourcebook Desktop.exe"; IconFilename: "{app}\SourcebookDesktop.ico"
Name: "{autodesktop}\Sourcebook for Agents"; Filename: "{app}\Sourcebook Desktop.exe"; IconFilename: "{app}\SourcebookDesktop.ico"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Additional shortcuts:"; Flags: unchecked

[Run]
Filename: "{app}\Sourcebook Desktop.exe"; Description: "Open Sourcebook for Agents"; Flags: nowait postinstall skipifsilent
