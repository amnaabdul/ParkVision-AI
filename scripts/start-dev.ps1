# ParkVision AI preflight: read-only checks and startup instructions.
# Does not install dependencies, post observations, or launch background services.
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$pythonPath = Join-Path $projectRoot '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $pythonPath)) {
    throw 'Python environment missing. From the project root: py -m venv .venv; then install requirements.txt.'
}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js is missing. Install Node 22.12+ or supported Node 20.19+.' }
if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) { throw 'npm.cmd is missing from PATH.' }
Push-Location -LiteralPath $projectRoot
try {
    & $pythonPath -c 'import fastapi, uvicorn'
    if ($LASTEXITCODE -ne 0) { throw 'Backend dependencies unavailable. Activate .venv and run pip install -r requirements.txt.' }
    & node --version
    if ($LASTEXITCODE -ne 0) { throw 'Node version check failed.' }
    if (-not (Test-Path -LiteralPath 'frontend\node_modules')) { Write-Warning 'Frontend dependencies missing. Run npm install once in frontend.' }
    if (-not (Test-Path -LiteralPath 'acpds_cls\weights\best.pt')) { Write-Warning 'Default classifier missing. Supply trained weights per README before running inference.' }
    foreach ($sample in @('frame_04_GOPR0089.JPG', 'frame_05_GOPR0090.JPG')) {
        if (-not (Test-Path -LiteralPath (Join-Path 'samples\live_occupancy' $sample))) { Write-Warning "Sample missing: $sample" }
    }
    Write-Host "Project root: $projectRoot"
    Write-Host 'Open separate terminals. Services remain foreground so errors are visible.'
    Write-Host 'Terminal 1 (root): .\.venv\Scripts\python.exe -m uvicorn backend.main:app --host 0.0.0.0 --port 8000'
    Write-Host 'Terminal 2: cd frontend; npm.cmd run dev -- --port 5173 --strictPort'
    Write-Host 'Browser: http://localhost:5173 | API: http://localhost:8000/docs'
    Write-Host 'Terminal 3 (root): .\.venv\Scripts\python.exe edge\detect.py --image "samples\live_occupancy\frame_04_GOPR0089.JPG" --device cpu --post'
    Write-Host 'Confirm the intended published layout before posting. See docs/DEMO_GUIDE.md.'
} finally {
    Pop-Location
}
