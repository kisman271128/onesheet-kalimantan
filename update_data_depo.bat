@echo off
cd /d "%~dp0"
echo ============================================
echo   ONESHEET KALIMANTAN - UPDATE DATA DEPO
echo ============================================
echo.

set "PYTHON_EXE="
if exist "%LOCALAPPDATA%\Programs\Python\Python314\python.exe" (
    set "PYTHON_EXE=%LOCALAPPDATA%\Programs\Python\Python314\python.exe"
) else if exist "%LOCALAPPDATA%\OneSheetKalimantan\Python312\python.exe" (
    set "PYTHON_EXE=%LOCALAPPDATA%\OneSheetKalimantan\Python312\python.exe"
) else (
    set "PYTHON_EXE=python"
)

if not exist "OneSheetDepo.xlsb" (
    echo ERROR: File OneSheetDepo.xlsb tidak ditemukan!
    echo Pastikan file Excel ada di folder yang sama.
    pause
    exit /b 1
)

echo Menjalankan export data depo...
"%PYTHON_EXE%" excel_to_json_depo.py

if errorlevel 1 (
    echo.
    echo Terjadi kesalahan saat proses export.
    pause
    exit /b 1
)

echo.
echo Selesai! Silakan upload data via aplikasi.
pause