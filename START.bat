@echo off
chcp 65001 >nul
title FindBest.de
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js не найден. Установите Node.js 22.13+ и запустите файл снова.
  pause
  exit /b 1
)
if not exist .env (
  echo Внимание: файл .env не найден.
  echo Скопируйте .env.example в .env и вставьте свой SERPER_API_KEY.
  echo.
)
echo Запускаю FindBest.de...
echo Откройте в браузере: http://localhost:3000
node server.js
pause
