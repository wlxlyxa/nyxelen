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
