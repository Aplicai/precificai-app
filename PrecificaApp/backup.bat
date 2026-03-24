@echo off
echo ========================================
echo   BACKUP PrecificaApp para Google Drive
echo ========================================
echo.

set ORIGEM=C:\Users\erick\Documents\Projeto APP mobile Precificação\Protótipo 1 - APP mobile\PrecificaApp
set DESTINO=G:\Meu Drive\01_GESTÃO APLICAÍ\08_APP PRECIFICAÇÃO\PrecificaApp

echo Copiando arquivos do projeto (sem node_modules)...
robocopy "%ORIGEM%\src" "%DESTINO%\src" /E /PURGE /NJH /NJS
robocopy "%ORIGEM%\assets" "%DESTINO%\assets" /E /PURGE /NJH /NJS
copy /Y "%ORIGEM%\App.js" "%DESTINO%\App.js" >nul
copy /Y "%ORIGEM%\app.json" "%DESTINO%\app.json" >nul
copy /Y "%ORIGEM%\index.js" "%DESTINO%\index.js" >nul
copy /Y "%ORIGEM%\index.web.js" "%DESTINO%\index.web.js" >nul
copy /Y "%ORIGEM%\metro.config.js" "%DESTINO%\metro.config.js" >nul
copy /Y "%ORIGEM%\package.json" "%DESTINO%\package.json" >nul
copy /Y "%ORIGEM%\.gitignore" "%DESTINO%\.gitignore" >nul 2>nul

echo.
echo ========================================
echo   BACKUP CONCLUIDO COM SUCESSO!
echo ========================================
echo.
echo Para restaurar em outro computador:
echo   1. Copie a pasta do Google Drive
echo   2. Execute: npm install --legacy-peer-deps
echo   3. Execute: npx expo start
echo.
pause
