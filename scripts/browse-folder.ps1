Add-Type -AssemblyName System.Windows.Forms

$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = "Select Factory Working Directory"
$dialog.ShowNewFolderButton = $true

if ($args.Count -gt 0 -and $args[0] -and (Test-Path $args[0])) {
    $dialog.SelectedPath = $args[0]
}

$topForm = New-Object System.Windows.Forms.Form
$topForm.TopMost = $true
$topForm.Width = 0
$topForm.Height = 0
$topForm.ShowInTaskbar = $false

$result = $dialog.ShowDialog($topForm)
$topForm.Dispose()

if ($result -eq [System.Windows.Forms.DialogResult]::OK) {
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    Write-Output $dialog.SelectedPath
}
