!macro NSIS_HOOK_POSTINSTALL
  Delete "$DESKTOP\望仔.lnk"
  RMDir /r "$SMPROGRAMS\望仔"
  SetShellVarContext all
  Delete "$DESKTOP\望仔.lnk"
  RMDir /r "$SMPROGRAMS\望仔"
  SetShellVarContext current
  CreateShortcut "$DESKTOP\Nyxelen.lnk" "$INSTDIR\nyxelen.exe" "" "$INSTDIR\nyxelen.exe" 0
!macroend
