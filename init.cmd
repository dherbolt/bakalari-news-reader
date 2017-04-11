rem nodeVersion=v4.2.4;
rem targetFolderName=nodejs;

rem echo "Downloading nodejs from: https://nodejs.org/"

md nodejs

rem echo "Downloading nodejs - it make take a few minutes"
rem powershell -Command "(New-Object Net.WebClient).DownloadFile('https://nodejs.org/dist/v6.9.1/node-v6.9.1-win-x64.zip', 'nodejs/node-v6.9.1-win-x64.zip')"
rem copy util\initProject\* nodejs

rem cd nodejs

echo "Unpacking"
tools\7z.exe -onodejs x tools\node-v7.8.0-win-x64.zip

rem cd ..

echo "Moving nodejs assets"
SET src_folder=nodejs\node-v7.8.0-win-x64
SET tar_folder=nodejs

for /f %%a IN ('dir "%src_folder%" /b') do move %src_folder%\%%a %tar_folder%

rmdir %src_folder%

rem set PATH=nodejs;%PATH%
rem --- NPM warnings will fail following commands, but not the '&&' ones
nodejs\npm install
echo "Done..."
