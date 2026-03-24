$action = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument '/c "C:\Users\erick\Documents\Projeto APP mobile Precificação\Protótipo 1 - APP mobile\PrecificaApp\backup.bat"'
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 40) -RepetitionDuration (New-TimeSpan -Days 365)
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
Register-ScheduledTask -TaskName 'PrecificaApp_Backup' -Action $action -Trigger $trigger -Settings $settings -Description 'Backup automático PrecificaApp para Google Drive a cada 40 minutos' -Force
Write-Host 'Tarefa agendada criada com sucesso!'
