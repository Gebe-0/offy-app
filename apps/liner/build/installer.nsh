; OFFY Custom NSIS Installer Script
; Modern Dark Glass Theme Configurations

!macro customHeader
  !define MUI_BGCOLOR "0C0D12"
  !define MUI_TEXTCOLOR "FFFFFF"
  !define MUI_INSTFILESPAGE_COLORS "FFFFFF 0C0D12"
!macroend

!macro customInit
  ; Ensure smooth single-user default installation without ugly Windows 98 multi-user dialogs
  SetRegView 64
!macroend

!macro customInstall
  ; Executed after files are extracted
  ; Registers custom offy protocol and registers install flag
  WriteRegStr HKCU "Software\OFFY" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "Software\OFFY" "Version" "${VERSION}"
!macroend
