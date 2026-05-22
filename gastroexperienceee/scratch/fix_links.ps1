$files = Get-ChildItem -Filter *.html
foreach ($file in $files) {
    $content = Get-Content $file.FullName -Raw
    if ($content -match 'href="/"') {
        Write-Host "Fixing href in $($file.Name)"
        $content = $content -replace 'href="/"', 'href="index.html"'
    }
    if ($content -match "location.href = '/'") {
        Write-Host "Fixing location.href in $($file.Name)"
        $content = $content -replace "location.href = '/'", "location.href = 'index.html'"
    }
    # Also fix /reservas in index.html
    if ($file.Name -eq "index.html" -and $content -match 'href="/reservas"') {
        Write-Host "Fixing /reservas in index.html"
        $content = $content -replace 'href="/reservas"', 'href="reservas.html"'
    }
    [System.IO.File]::WriteAllText($file.FullName, $content)
}
