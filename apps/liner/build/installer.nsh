; OFFY Custom NSIS Installer Script

!macro customInit
  SetRegView 64
!macroend

!macro customInstall
  WriteRegStr HKCU "Software\OFFY" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "Software\OFFY" "Version" "${VERSION}"
!macroend
