[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$LatestJsonPath,

  [Parameter(Mandatory = $true)]
  [string]$BriefJsonPath,

  [Parameter(Mandatory = $true)]
  [string]$BriefTextPath,

  [string]$StatePath = "",
  [string]$DestinationType = "",
  [string]$DestinationToken = "",
  [string]$Identity = "",
  [string]$IndexDoc = "",
  [string]$FolderName = ""
)

$ErrorActionPreference = "Stop"

$root = "D:\codex\webaccess"

if (!(Test-Path $LatestJsonPath)) {
  throw "Latest JSON report not found at $LatestJsonPath"
}

if (!(Test-Path $BriefJsonPath)) {
  throw "Brief JSON report not found at $BriefJsonPath"
}

if (!(Test-Path $BriefTextPath)) {
  throw "Brief text report not found at $BriefTextPath"
}

if ([string]::IsNullOrWhiteSpace($StatePath)) {
  $StatePath = Join-Path (Split-Path -Parent $BriefTextPath) "theinformation-lark-publish-state.json"
}

if ([string]::IsNullOrWhiteSpace($DestinationType)) {
  $DestinationType = $env:THE_INFORMATION_LARK_DESTINATION_TYPE
}

if ([string]::IsNullOrWhiteSpace($DestinationToken)) {
  $DestinationToken = $env:THE_INFORMATION_LARK_DESTINATION_TOKEN
}

if ([string]::IsNullOrWhiteSpace($Identity)) {
  $Identity = $env:THE_INFORMATION_LARK_AS
}

if ([string]::IsNullOrWhiteSpace($IndexDoc)) {
  $IndexDoc = $env:THE_INFORMATION_LARK_INDEX_DOC
}

if ([string]::IsNullOrWhiteSpace($FolderName)) {
  $FolderName = $env:THE_INFORMATION_LARK_FOLDER_NAME
}

if ([string]::IsNullOrWhiteSpace($Identity)) {
  $Identity = "user"
}

if ([string]::IsNullOrWhiteSpace($DestinationType) -and [string]::IsNullOrWhiteSpace($DestinationToken) -and [string]::IsNullOrWhiteSpace($FolderName)) {
  $FolderName = "the information"
}

if ([string]::IsNullOrWhiteSpace($DestinationType) -and [string]::IsNullOrWhiteSpace($DestinationToken) -and ![string]::IsNullOrWhiteSpace($FolderName)) {
  $folderJson = node (Join-Path $root "scripts\ensure-lark-root-folder.mjs") --as $Identity --name $FolderName
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to resolve or create Lark folder '$FolderName'"
  }

  $folderResult = $folderJson | ConvertFrom-Json
  $DestinationType = "folder-token"
  $DestinationToken = $folderResult.token
}

$payloadJson = node (Join-Path $root "scripts\render-theinformation-lark-publish-data.mjs") `
  --latest $LatestJsonPath `
  --brief-json $BriefJsonPath `
  --brief-text $BriefTextPath

if ($LASTEXITCODE -ne 0) {
  throw "Failed to render Lark publish payload"
}

$payload = $payloadJson | ConvertFrom-Json

$state = $null
if (Test-Path $StatePath) {
  $state = Get-Content -Raw $StatePath | ConvertFrom-Json
}

$resolvedIndexDocId = $null
$resolvedIndexDocUrl = $null

if (![string]::IsNullOrWhiteSpace($IndexDoc)) {
  $resolvedIndexDocId = $IndexDoc
} elseif ($null -ne $state -and $null -ne $state.indexDoc) {
  $resolvedIndexDocId = $state.indexDoc.docId
  $resolvedIndexDocUrl = $state.indexDoc.docUrl
}

$existingDetailDoc = $null
if ($null -ne $state -and $null -ne $state.detailDocsByDate -and $state.detailDocsByDate.PSObject.Properties.Name -contains $payload.reportDateKey) {
  $existingDetailDoc = $state.detailDocsByDate.$($payload.reportDateKey)
}

function Invoke-LarkCreateDocument {
  param(
    [string]$Title,
    [string]$Markdown
  )

  $args = @("docs", "+create", "--as", $Identity, "--title", $Title, "--markdown", $Markdown)

  switch ($DestinationType) {
    "folder-token" { $args += @("--folder-token", $DestinationToken) }
    "wiki-node" { $args += @("--wiki-node", $DestinationToken) }
    "wiki-space" { $args += @("--wiki-space", $DestinationToken) }
    "" { }
    default { throw "Unsupported destination type: $DestinationType" }
  }

  $result = & lark-cli @args
  if ($LASTEXITCODE -ne 0) {
    throw "lark-cli docs +create failed for '$Title'"
  }

  $parsed = $result | ConvertFrom-Json
  if ($null -ne $parsed.data) {
    return $parsed.data
  }

  return $parsed
}

function Invoke-LarkUpdateDocument {
  param(
    [string]$Doc,
    [string]$Markdown,
    [string]$Mode,
    [string]$NewTitle = ""
  )

  $args = @("docs", "+update", "--as", $Identity, "--doc", $Doc, "--mode", $Mode)
  if ($Markdown -ne $null) {
    $args += @("--markdown", $Markdown)
  }
  if (![string]::IsNullOrWhiteSpace($NewTitle)) {
    $args += @("--new-title", $NewTitle)
  }

  $result = & lark-cli @args
  if ($LASTEXITCODE -ne 0) {
    throw "lark-cli docs +update failed for '$Doc'"
  }

  $parsed = $result | ConvertFrom-Json
  if ($null -ne $parsed.data) {
    return $parsed.data
  }

  return $parsed
}

$indexDocWasCreated = $false
if ([string]::IsNullOrWhiteSpace($resolvedIndexDocId)) {
  $indexCreateResult = Invoke-LarkCreateDocument -Title $payload.indexTitle -Markdown $payload.indexHeaderMarkdown
  $resolvedIndexDocId = $indexCreateResult.doc_id
  $resolvedIndexDocUrl = $indexCreateResult.doc_url
  $indexDocWasCreated = $true
}

$detailDocAction = "create"
$detailDocId = $null
$detailDocUrl = $null

if ($null -ne $existingDetailDoc -and ![string]::IsNullOrWhiteSpace($existingDetailDoc.docId)) {
  $detailDocAction = "update"
  $detailDocId = $existingDetailDoc.docId
  $detailDocUrl = $existingDetailDoc.docUrl

  Invoke-LarkUpdateDocument -Doc $detailDocId -Mode "overwrite" -Markdown $payload.detailMarkdown -NewTitle $payload.detailTitle | Out-Null
} else {
  $detailCreateResult = Invoke-LarkCreateDocument -Title $payload.detailTitle -Markdown $payload.detailMarkdown
  $detailDocId = $detailCreateResult.doc_id
  $detailDocUrl = $detailCreateResult.doc_url
}

$appendedIndexEntry = $false
if ($detailDocAction -eq "create") {
  $indexEntryMarkdown = [string]$payload.indexEntryMarkdown
  $indexEntryMarkdown = $indexEntryMarkdown.Replace("{{DOC_URL}}", $detailDocUrl)
  Invoke-LarkUpdateDocument -Doc $resolvedIndexDocId -Mode "append" -Markdown ("`n`n" + $indexEntryMarkdown) | Out-Null
  $appendedIndexEntry = $true
}

$nextState = @{
  version = 1
  indexDoc = @{
    docId = $resolvedIndexDocId
    docUrl = $resolvedIndexDocUrl
    title = $payload.indexTitle
  }
  detailDocsByDate = @{}
}

if ($null -ne $state -and $null -ne $state.detailDocsByDate) {
  foreach ($property in $state.detailDocsByDate.PSObject.Properties) {
    $nextState.detailDocsByDate[$property.Name] = @{
      docId = $property.Value.docId
      docUrl = $property.Value.docUrl
      title = $property.Value.title
      publishedAtIso = $property.Value.publishedAtIso
    }
  }
}

$nextState.detailDocsByDate[$payload.reportDateKey] = @{
  docId = $detailDocId
  docUrl = $detailDocUrl
  title = $payload.detailTitle
  publishedAtIso = (Get-Date).ToUniversalTime().ToString("o")
}

New-Item -ItemType Directory -Force -Path (Split-Path -Parent $StatePath) | Out-Null
$nextState | ConvertTo-Json -Depth 10 | Set-Content -Path $StatePath -Encoding utf8

Write-Output (
  @{
    ok = $true
    reportDateKey = $payload.reportDateKey
    identity = $Identity
    destinationType = $DestinationType
    destinationToken = $DestinationToken
    folderName = $FolderName
    indexDocId = $resolvedIndexDocId
    indexDocUrl = $resolvedIndexDocUrl
    indexDocCreated = $indexDocWasCreated
    detailDocId = $detailDocId
    detailDocUrl = $detailDocUrl
    detailDocAction = $detailDocAction
    appendedIndexEntry = $appendedIndexEntry
    statePath = $StatePath
  } | ConvertTo-Json -Depth 10
)
