!macro NSIS_HOOK_POSTINSTALL
  Delete "$DESKTOP\望仔.lnk"
  RMDir /r "$SMPROGRAMS\望仔"
  SetShellVarContext all
  Delete "$DESKTOP\望仔.lnk"
  RMDir /r "$SMPROGRAMS\望仔"
  SetShellVarContext current
  CreateShortcut "$DESKTOP\Nyxelen.lnk" "$INSTDIR\nyxelen.exe" "" "$INSTDIR\nyxelen.exe" 0
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  SetShellVarContext current
  Delete "$DESKTOP\Nyxelen.lnk"
  Delete "$DESKTOP\望仔.lnk"
  RMDir /r "$SMPROGRAMS\Nyxelen"
  RMDir /r "$SMPROGRAMS\望仔"
  SetShellVarContext all
  Delete "$DESKTOP\Nyxelen.lnk"
  Delete "$DESKTOP\望仔.lnk"
  RMDir /r "$SMPROGRAMS\Nyxelen"
  RMDir /r "$SMPROGRAMS\望仔"
  SetShellVarContext current
!macroend
