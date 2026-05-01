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
  [string]$FolderName = "",
  [int]$MarkdownChunkSize = 12000,
  [string]$ExistingDetailDocId = "",
  [string]$ExistingDetailDocUrl = "",
  [switch]$AppendIndexEntryForExisting
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

if ($MarkdownChunkSize -lt 1000) {
  throw "MarkdownChunkSize must be at least 1000"
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

function Invoke-LarkCliWithRetry {
  param(
    [string[]]$CliArgs,
    [string]$Description
  )

  $maxAttempts = 3
  for ($attempt = 1; $attempt -le $maxAttempts; $attempt++) {
    $result = & lark-cli @CliArgs 2>&1
    $exitCode = $LASTEXITCODE
    if ($exitCode -eq 0) {
      return $result
    }

    $resultText = [string]::Join("`n", @($result | ForEach-Object { [string]$_ }))
    $isRetryable = $resultText -match "TLS handshake timeout|MCP transport failed|network"
    if (!$isRetryable -or $attempt -eq $maxAttempts) {
      throw "lark-cli $Description failed"
    }

    Start-Sleep -Seconds (10 * $attempt)
  }
}

function Invoke-LarkFetchDocumentMarkdown {
  param(
    [string]$Doc
  )

  $result = Invoke-LarkCliWithRetry -CliArgs @("docs", "+fetch", "--as", $Identity, "--doc", $Doc, "--limit", "200000", "--jq", ".data.markdown") -Description "docs +fetch for '$Doc'"
  return [string]::Join("`n", @($result | ForEach-Object { [string]$_ }))
}

function Assert-LarkDocumentContainsMarkers {
  param(
    [string]$Doc,
    [string[]]$Markers,
    [string]$Description
  )

  $cleanMarkers = @($Markers | Where-Object { ![string]::IsNullOrWhiteSpace($_) } | Select-Object -Unique)
  if ($cleanMarkers.Count -eq 0) {
    return
  }

  $maxAttempts = 3
  for ($attempt = 1; $attempt -le $maxAttempts; $attempt++) {
    $markdown = Invoke-LarkFetchDocumentMarkdown -Doc $Doc
    $missingMarkers = @($cleanMarkers | Where-Object { $markdown.IndexOf($_, [System.StringComparison]::Ordinal) -lt 0 })
    if ($missingMarkers.Count -eq 0) {
      return
    }

    if ($attempt -eq $maxAttempts) {
      throw "Lark document '$Doc' is missing expected $Description marker(s): $($missingMarkers -join '; ')"
    }

    Start-Sleep -Seconds (5 * $attempt)
  }
}

function ConvertFrom-LarkJsonResult {
  param(
    [object[]]$Result,
    [string]$Description
  )

  $resultText = [string]::Join("`n", @($Result | ForEach-Object { [string]$_ }))
  $jsonStart = $resultText.IndexOf("{", [System.StringComparison]::Ordinal)
  $jsonEnd = $resultText.LastIndexOf("}", [System.StringComparison]::Ordinal)
  if ($jsonStart -lt 0 -or $jsonEnd -lt $jsonStart) {
    throw "Could not parse JSON from lark-cli $Description output"
  }

  return $resultText.Substring($jsonStart, $jsonEnd - $jsonStart + 1) | ConvertFrom-Json
}

function Assert-LarkJsonOk {
  param(
    [object]$Parsed,
    [string]$Description
  )

  if ($null -ne $Parsed.ok -and $Parsed.ok -eq $false) {
    throw "lark-cli $Description returned ok=false"
  }
}

function Get-LarkDocumentId {
  param(
    [object]$Document,
    [string]$Description
  )

  foreach ($propertyName in @("doc_id", "docId", "document_id", "token")) {
    if ($null -ne $Document.$propertyName -and ![string]::IsNullOrWhiteSpace([string]$Document.$propertyName)) {
      return [string]$Document.$propertyName
    }
  }

  throw "Could not resolve Lark document id from $Description"
}

function Get-LarkDocumentUrl {
  param(
    [object]$Document,
    [string]$DocId
  )

  foreach ($propertyName in @("doc_url", "docUrl", "url")) {
    if ($null -ne $Document.$propertyName -and ![string]::IsNullOrWhiteSpace([string]$Document.$propertyName)) {
      return [string]$Document.$propertyName
    }
  }

  return "https://www.feishu.cn/docx/$DocId"
}

$payloadJson = node (Join-Path $root "scripts\render-theinformation-lark-publish-data.mjs") `
  --latest $LatestJsonPath `
  --brief-json $BriefJsonPath `
  --brief-text $BriefTextPath

if ($LASTEXITCODE -ne 0) {
  throw "Failed to render Lark publish payload"
}

$payload = $payloadJson | ConvertFrom-Json
$briefForMarkers = Get-Content -Raw -Encoding UTF8 $BriefJsonPath | ConvertFrom-Json

$detailVerificationMarkers = New-Object System.Collections.Generic.List[string]
foreach ($sectionName in @("featured_articles", "other_articles", "partial_articles")) {
  if ($null -eq $briefForMarkers.$sectionName) {
    continue
  }

  foreach ($article in @($briefForMarkers.$sectionName)) {
    if ($null -ne $article.title -and ![string]::IsNullOrWhiteSpace($article.title)) {
      $detailVerificationMarkers.Add([string]$article.title) | Out-Null
    }
  }
}

$state = $null
if (Test-Path $StatePath) {
  $state = Get-Content -Raw -Encoding UTF8 $StatePath | ConvertFrom-Json
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
  $existingDetailDoc = $state.detailDocsByDate.PSObject.Properties[$payload.reportDateKey].Value
} elseif (![string]::IsNullOrWhiteSpace($ExistingDetailDocId)) {
  $existingDetailDoc = @{
    docId = $ExistingDetailDocId
    docUrl = $ExistingDetailDocUrl
    title = $payload.detailTitle
  }
}

function Invoke-LarkCreateDocument {
  param(
    [string]$Title,
    [string]$Markdown
  )

  $chunks = @(Split-MarkdownContent -Markdown $Markdown)
  $args = @("docs", "+create", "--as", $Identity, "--title", $Title, "--markdown", $chunks[0])

  switch ($DestinationType) {
    "folder-token" { $args += @("--folder-token", $DestinationToken) }
    "wiki-node" { $args += @("--wiki-node", $DestinationToken) }
    "wiki-space" { $args += @("--wiki-space", $DestinationToken) }
    "" { }
    default { throw "Unsupported destination type: $DestinationType" }
  }

  $result = Invoke-LarkCliWithRetry -CliArgs $args -Description "docs +create for '$Title'"

  $parsed = ConvertFrom-LarkJsonResult -Result $result -Description "docs +create"
  Assert-LarkJsonOk -Parsed $parsed -Description "docs +create"
  if ($null -ne $parsed.data) {
    $createdDoc = $parsed.data
  } else {
    $createdDoc = $parsed
  }
  $createdDocId = Get-LarkDocumentId -Document $createdDoc -Description "docs +create"
  $createdDocUrl = Get-LarkDocumentUrl -Document $createdDoc -DocId $createdDocId

  for ($chunkIndex = 1; $chunkIndex -lt $chunks.Count; $chunkIndex++) {
    Invoke-LarkUpdateDocument -Doc $createdDocId -Markdown $chunks[$chunkIndex] -Mode "append" | Out-Null
  }

  return @{
    doc_id = $createdDocId
    doc_url = $createdDocUrl
    title = $Title
  }
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

  if ($Mode -eq "append" -or $Mode -eq "overwrite" -or $Mode -eq "replace_all") {
    $chunks = @(Split-MarkdownContent -Markdown $Markdown)
    $resultData = $null
    for ($chunkIndex = 0; $chunkIndex -lt $chunks.Count; $chunkIndex++) {
      $chunkMode = $Mode
      if (($Mode -eq "overwrite" -or $Mode -eq "replace_all") -and $chunkIndex -gt 0) {
        $chunkMode = "append"
      }

      $chunkArgs = @("docs", "+update", "--as", $Identity, "--doc", $Doc, "--mode", $chunkMode, "--markdown", $chunks[$chunkIndex])
      if ($chunkIndex -eq 0 -and ![string]::IsNullOrWhiteSpace($NewTitle)) {
        $chunkArgs += @("--new-title", $NewTitle)
      }

      $result = Invoke-LarkCliWithRetry -CliArgs $chunkArgs -Description "docs +update for '$Doc'"

      $parsed = ConvertFrom-LarkJsonResult -Result $result -Description "docs +update"
      Assert-LarkJsonOk -Parsed $parsed -Description "docs +update"
      if ($null -ne $parsed.data) {
        $resultData = $parsed.data
      } else {
        $resultData = $parsed
      }
    }

    return $resultData
  }

  $result = Invoke-LarkCliWithRetry -CliArgs $args -Description "docs +update for '$Doc'"

  $parsed = ConvertFrom-LarkJsonResult -Result $result -Description "docs +update"
  Assert-LarkJsonOk -Parsed $parsed -Description "docs +update"
  if ($null -ne $parsed.data) {
    return $parsed.data
  }

  return $parsed
}

function Split-MarkdownContent {
  param(
    [AllowEmptyString()]
    [string]$Markdown
  )

  if ([string]::IsNullOrEmpty($Markdown)) {
    return @("")
  }

  if ($Markdown.Length -le $MarkdownChunkSize) {
    return @($Markdown)
  }

  $chunks = New-Object System.Collections.Generic.List[string]
  $remaining = $Markdown
  while ($remaining.Length -gt $MarkdownChunkSize) {
    $candidate = $remaining.Substring(0, $MarkdownChunkSize)
    $splitAt = $candidate.LastIndexOf("`n`n", [System.StringComparison]::Ordinal)
    if ($splitAt -lt [Math]::Floor($MarkdownChunkSize * 0.5)) {
      $splitAt = $candidate.LastIndexOf("`n", [System.StringComparison]::Ordinal)
    }
    if ($splitAt -lt [Math]::Floor($MarkdownChunkSize * 0.5)) {
      $splitAt = $MarkdownChunkSize
    }

    $chunks.Add($remaining.Substring(0, $splitAt).TrimEnd())
    $remaining = $remaining.Substring($splitAt).TrimStart()
  }

  if ($remaining.Length -gt 0) {
    $chunks.Add($remaining)
  }

  return $chunks.ToArray()
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

$detailMarkersToVerify = @()
if ($detailVerificationMarkers.Count -gt 0) {
  $detailMarkersToVerify += $detailVerificationMarkers[0]
  if ($detailVerificationMarkers.Count -gt 1) {
    $detailMarkersToVerify += $detailVerificationMarkers[$detailVerificationMarkers.Count - 1]
  }
}

if ($null -ne $existingDetailDoc -and ![string]::IsNullOrWhiteSpace($existingDetailDoc.docId)) {
  $detailDocId = $existingDetailDoc.docId
  $detailDocUrl = $existingDetailDoc.docUrl
  Assert-LarkDocumentContainsMarkers -Doc $detailDocId -Markers $detailMarkersToVerify -Description "existing detail content"
  $detailDocAction = "reuse"
} else {
  $detailCreateResult = Invoke-LarkCreateDocument -Title $payload.detailTitle -Markdown $payload.detailMarkdown
  $detailDocId = $detailCreateResult.doc_id
  $detailDocUrl = $detailCreateResult.doc_url
}

Assert-LarkDocumentContainsMarkers -Doc $detailDocId -Markers $detailMarkersToVerify -Description "detail content"

$appendedIndexEntry = $false
if ($detailDocAction -eq "create" -or $detailDocAction -eq "replace" -or $AppendIndexEntryForExisting) {
  $indexEntryMarkdown = [string]$payload.indexEntryMarkdown
  $indexEntryMarkdown = $indexEntryMarkdown.Replace("{{DOC_URL}}", $detailDocUrl)
  Invoke-LarkUpdateDocument -Doc $resolvedIndexDocId -Mode "append" -Markdown ("`n`n" + $indexEntryMarkdown) | Out-Null
  $appendedIndexEntry = $true
  Assert-LarkDocumentContainsMarkers -Doc $resolvedIndexDocId -Markers @($payload.reportDateKey, $payload.detailTitle) -Description "index entry"
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
