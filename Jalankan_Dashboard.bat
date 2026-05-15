@echo off
setlocal enabledelayedexpansion
title OneSheet Kalimantan - Setup & Launch
color 0A

REM Pindah ke folder tempat file .bat ini berada
cd /d "%~dp0"

echo ============================================
echo   ONESHEET KALIMANTAN - SETUP ^& LAUNCH
echo ============================================
echo.

REM =============================================
REM CEK PYTHON (termasuk path umum)
REM =============================================


REM =============================================
REM AUTO-DOWNLOAD FILE TERBARU DARI GITHUB
REM =============================================
echo.
echo [0/4] Mengecek dan mengunduh file terbaru...
set _GHRAW=https://raw.githubusercontent.com/kisman271128/onesheet-kalimantan/master

call :download_file "launcher.html"
call :download_file "index.html"
call :download_file "update_data_depo.bat"
call :download_file "users.json"
call :download_file "app.js"
call :download_file "styles.css"

echo.

echo [1/4] Memeriksa Python...

REM Cek python di PATH dulu
python --version >nul 2>&1
if not errorlevel 1 goto :python_found

REM Cek lokasi umum Python secara manual
set PYTHON_EXE=
for %%P in (
    "%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
    "%LOCALAPPDATA%\Programs\Python\Python311\python.exe"
    "%LOCALAPPDATA%\Programs\Python\Python310\python.exe"
    "%LOCALAPPDATA%\Programs\Python\Python39\python.exe"
    "C:\Python312\python.exe"
    "C:\Python311\python.exe"
    "C:\Python310\python.exe"
    "C:\Program Files\Python312\python.exe"
    "C:\Program Files\Python311\python.exe"
) do (
    if exist %%P (
        set PYTHON_EXE=%%~P
        goto :found_manual
    )
)
goto :install_python

:found_manual
echo Python ditemukan di: !PYTHON_EXE!
set "PATH=!PYTHON_EXE:python.exe=!;!PYTHON_EXE:python.exe=!Scripts;!PATH!"
python --version >nul 2>&1
if not errorlevel 1 goto :python_found

:install_python
echo.
echo Python belum terinstall atau tidak terdeteksi.
echo Mencoba menginstall otomatis...
echo.

REM Coba winget dulu (dengan --source winget untuk hindari msstore SSL error)
winget --version >nul 2>&1
if not errorlevel 1 (
    echo Menggunakan winget...
    winget install -e --id Python.Python.3.12 --source winget --silent --accept-package-agreements --accept-source-agreements >nul 2>&1
    
    REM Refresh PATH setelah winget install
    set "PATH=%LOCALAPPDATA%\Programs\Python\Python312;%LOCALAPPDATA%\Programs\Python\Python312\Scripts;%PATH%"
    
    python --version >nul 2>&1
    if not errorlevel 1 goto :python_found
    
    REM Coba cari manual lagi
    for %%P in (
        "%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
        "%LOCALAPPDATA%\Programs\Python\Python311\python.exe"
    ) do (
        if exist %%P (
            set PYTHON_EXE=%%~P
            set "PATH=%%~dP%%~pP;%%~dP%%~pPScripts;!PATH!"
            goto :python_found
        )
    )
)

REM Fallback: download installer langsung
echo Mendownload Python installer...
set PYTHON_URL=https://www.python.org/ftp/python/3.12.4/python-3.12.4-amd64.exe
set PYTHON_INSTALLER=%TEMP%\python_installer.exe

powershell -Command "& {[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri '%PYTHON_URL%' -OutFile '%PYTHON_INSTALLER%' -UseBasicParsing}" >nul 2>&1

if not exist "%PYTHON_INSTALLER%" (
    echo.
    echo ============================================
    echo  INSTALASI OTOMATIS GAGAL
    echo ============================================
    echo.
    echo Silakan install Python MANUAL:
    echo  1. Buka: https://www.python.org/downloads/
    echo  2. Download Python 3.12 (Windows installer)
    echo  3. Saat install, CENTANG "Add Python to PATH"
    echo  4. Setelah selesai, jalankan file ini lagi
    echo.
    pause
    exit /b 1
)

echo Menginstall Python (mohon tunggu 1-2 menit)...
"%PYTHON_INSTALLER%" /quiet InstallAllUsers=0 PrependPath=1 Include_test=0
del "%PYTHON_INSTALLER%" >nul 2>&1

set "PATH=%LOCALAPPDATA%\Programs\Python\Python312;%LOCALAPPDATA%\Programs\Python\Python312\Scripts;%PATH%"

python --version >nul 2>&1
if errorlevel 1 (
    echo.
    echo Python terinstall tapi belum aktif di sesi ini.
    echo Mohon RESTART laptop lalu jalankan file ini lagi.
    echo.
    pause
    exit /b 1
)

:python_found
for /f "tokens=*" %%i in ('python --version 2^>^&1') do echo OK: %%i

REM =============================================
REM CEK DAN INSTALL DEPENDENCIES
REM =============================================
echo.
echo [2/4] Memeriksa library Python...

set DEPS_OK=1
python -c "import pandas" >nul 2>&1
if errorlevel 1 set DEPS_OK=0
python -c "import pyxlsb" >nul 2>&1
if errorlevel 1 set DEPS_OK=0
python -c "import openpyxl" >nul 2>&1
if errorlevel 1 set DEPS_OK=0

if "%DEPS_OK%"=="0" (
    echo Library belum lengkap, menginstall...
    echo ^(Pastikan laptop terhubung ke internet^)
    python -m pip install --upgrade pip --quiet
    python -m pip install pandas pyxlsb openpyxl --quiet
    if errorlevel 1 (
        echo.
        echo GAGAL menginstall library!
        echo Pastikan koneksi internet aktif lalu coba lagi.
        echo.
        pause
        exit /b 1
    )
    echo Library berhasil diinstall
) else (
    echo OK: Semua library sudah tersedia
)

REM =============================================
REM CEK PORT 8080
REM =============================================
echo.
echo [3/4] Memeriksa port...

set SERVER_PORT=8080
netstat -ano | find ":8080" >nul 2>&1
if not errorlevel 1 (
    echo Port 8080 sudah digunakan, beralih ke port 8090...
    set SERVER_PORT=8090
) else (
    echo OK: Menggunakan port 8080
)

REM =============================================
REM JALANKAN SERVER DAN BUKA BROWSER
REM =============================================
echo.
echo [4/4] Menjalankan dashboard...

REM Tentukan file yang akan dibuka di browser
set OPEN_FILE=launcher.html
if not exist "launcher.html" (
    if not exist "index.html" (
        echo.
        echo ERROR: launcher.html dan index.html tidak ditemukan!
        echo Pastikan terhubung internet saat pertama kali menjalankan.
        echo.
        pause
        exit /b 1
    )
    set OPEN_FILE=index.html
)

echo.
echo ============================================
echo  Dashboard siap!
echo  Alamat: http://localhost:!SERVER_PORT!
echo.
echo  JANGAN tutup jendela ini selama memakai
echo  dashboard. Tekan Ctrl+C untuk stop.
echo ============================================
echo.

timeout /t 2 /nobreak >nul
start "" "http://localhost:!SERVER_PORT!/!OPEN_FILE!"
python -m http.server !SERVER_PORT!


REM =============================================
REM SUBROUTINE: Download file dari GitHub
REM =============================================
:download_file
set _F=%~1
echo   Mengunduh %_F% ...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$url='%_GHRAW%/%_F%'; try { (New-Object System.Net.WebClient).DownloadFile($url,'%_F%'); Write-Host '  + OK' -ForegroundColor Green } catch { Write-Host ('  ! Gagal: '+$_.Exception.Message) -ForegroundColor Red }"
goto :eof

pause
