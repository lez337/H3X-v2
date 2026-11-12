!macro customWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "Your workspace.$\r$\nReady to install."
  !define MUI_WELCOMEPAGE_TEXT "Welcome to H3X Searcher.$\r$\n$\r$\nSet up your investigation workspace in a few steps. Choose where to install, then let setup handle the rest.$\r$\n$\r$\nH3X will stay closed when installation finishes. Open it from your desktop or Start menu when you are ready."
  !insertmacro MUI_PAGE_WELCOME
!macroend

!macro customFinishPage
  !define MUI_FINISHPAGE_TITLE "All set."
  !define MUI_FINISHPAGE_TEXT "H3X Searcher is installed.$\r$\n$\r$\nOpen H3X Searcher from your desktop or Start menu whenever you are ready.$\r$\n$\r$\nClick Finish to close setup."
  !insertmacro MUI_PAGE_FINISH
!macroend
