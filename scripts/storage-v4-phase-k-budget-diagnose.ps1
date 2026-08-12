param(
  [string]$Project = 'atlasmap-dev'
)

$ErrorActionPreference = 'Stop'

if ($Project -ne 'atlasmap-dev') {
  throw 'Este diagnostico de budget esta bloqueado deliberadamente a atlasmap-dev.'
}
if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) {
  throw 'No se encontro gcloud en PATH.'
}

$activeAccount = (& gcloud config get-value account 2>$null).Trim()
if (-not $activeAccount -or $activeAccount -eq '(unset)') {
  throw 'gcloud no tiene una cuenta autenticada activa.'
}

function Get-HttpStatusCode {
  param($ErrorRecord)
  try {
    if ($null -ne $ErrorRecord.Exception.Response.StatusCode) {
      return [int]$ErrorRecord.Exception.Response.StatusCode
    }
  } catch {
    return $null
  }
  return $null
}

function Get-GcloudAccessToken {
  $token = (& gcloud auth print-access-token 2>$null).Trim()
  if (-not $token) { return $null }
  return $token
}

function Invoke-BudgetListProbe {
  param(
    [string]$BillingAccountName,
    [string]$ProjectId,
    [switch]$ProjectScope
  )

  $token = Get-GcloudAccessToken
  if (-not $token -or -not $BillingAccountName -or $BillingAccountName -notmatch '^billingAccounts/') {
    return [pscustomobject]@{
      status = 'unavailable'
      httpStatus = $null
      count = $null
    }
  }

  $uri = "https://billingbudgets.googleapis.com/v1/$BillingAccountName/budgets"
  if ($ProjectScope) {
    $scope = [Uri]::EscapeDataString("projects/$ProjectId")
    $uri = "${uri}?scope=$scope"
  }

  try {
    $response = Invoke-RestMethod -Method Get -Uri $uri -Headers @{
      Authorization = "Bearer $token"
      'x-goog-user-project' = $ProjectId
    }
    $budgets = if ($null -eq $response.budgets) { @() } else { @($response.budgets) }
    return [pscustomobject]@{
      status = 'ok'
      httpStatus = 200
      count = $budgets.Count
    }
  } catch {
    return [pscustomobject]@{
      status = 'unavailable'
      httpStatus = Get-HttpStatusCode $_
      count = $null
    }
  }
}

function Get-BudgetApiState {
  param([string]$ProjectId)

  $raw = & gcloud services list `
    --enabled `
    --project=$ProjectId `
    --filter="config.name:billingbudgets.googleapis.com" `
    --format="value(config.name)" 2>&1
  if ($LASTEXITCODE -ne 0) {
    return [pscustomobject]@{
      status = 'unavailable'
      enabled = $null
    }
  }

  $services = @($raw | ForEach-Object { [string]$_ } | Where-Object { $_ })
  return [pscustomobject]@{
    status = 'ok'
    enabled = [bool]($services -contains 'billingbudgets.googleapis.com')
  }
}

function Invoke-IamPermissionProbe {
  param(
    [string]$Uri,
    [string[]]$Permissions,
    [string]$Token
  )

  if (-not $Token) {
    return [pscustomobject]@{
      status = 'unavailable'
      httpStatus = $null
      permissions = @()
    }
  }

  $body = @{ permissions = @($Permissions) } | ConvertTo-Json -Compress
  try {
    $response = Invoke-RestMethod `
      -Method Post `
      -Uri $Uri `
      -Headers @{ Authorization = "Bearer $Token" } `
      -ContentType 'application/json' `
      -Body $body
    return [pscustomobject]@{
      status = 'ok'
      httpStatus = 200
      permissions = @($response.permissions)
    }
  } catch {
    return [pscustomobject]@{
      status = 'unavailable'
      httpStatus = Get-HttpStatusCode $_
      permissions = @()
    }
  }
}

function Has-Permission {
  param($Probe, [string]$Permission)
  if ($Probe.status -ne 'ok') { return $null }
  return [bool](@($Probe.permissions) -contains $Permission)
}

$billingRaw = & gcloud billing projects describe $Project --format=json 2>&1
if ($LASTEXITCODE -ne 0) {
  throw "No se pudo describir billing para el proyecto: $($billingRaw -join [Environment]::NewLine)"
}
$billing = ($billingRaw -join [Environment]::NewLine) | ConvertFrom-Json
$billingEnabled = [bool]$billing.billingEnabled
$billingAccountName = [string]$billing.billingAccountName
$token = Get-GcloudAccessToken

$budgetApi = Get-BudgetApiState -ProjectId $Project

$projectIam = Invoke-IamPermissionProbe `
  -Uri "https://cloudresourcemanager.googleapis.com/v1/projects/${Project}:testIamPermissions" `
  -Permissions @(
    'serviceusage.services.use',
    'resourcemanager.projects.get',
    'billing.resourcebudgets.read'
  ) `
  -Token $token

$billingIam = if ($billingEnabled -and $billingAccountName -match '^billingAccounts/') {
  Invoke-IamPermissionProbe `
    -Uri "https://cloudbilling.googleapis.com/v1/${BillingAccountName}:testIamPermissions" `
    -Permissions @('billing.budgets.list') `
    -Token $token
} else {
  [pscustomobject]@{ status = 'not-applicable'; httpStatus = $null; permissions = @() }
}

$accountScope = if ($billingEnabled) {
  Invoke-BudgetListProbe -BillingAccountName $billingAccountName -ProjectId $Project
} else {
  [pscustomobject]@{ status = 'not-applicable'; httpStatus = $null; count = $null }
}

$projectScope = if ($billingEnabled) {
  Invoke-BudgetListProbe -BillingAccountName $billingAccountName -ProjectId $Project -ProjectScope
} else {
  [pscustomobject]@{ status = 'not-applicable'; httpStatus = $null; count = $null }
}

$quotaPermission = Has-Permission -Probe $projectIam -Permission 'serviceusage.services.use'
$projectGetPermission = Has-Permission -Probe $projectIam -Permission 'resourcemanager.projects.get'
$projectBudgetReadPermission = Has-Permission -Probe $projectIam -Permission 'billing.resourcebudgets.read'
$billingBudgetListPermission = Has-Permission -Probe $billingIam -Permission 'billing.budgets.list'
$projectBudgetReadPath = if ($null -eq $projectGetPermission -or $null -eq $projectBudgetReadPermission) {
  $null
} else {
  [bool]($projectGetPermission -and $projectBudgetReadPermission)
}

$visibility = if (-not $billingEnabled) {
  'billing-disabled'
} elseif ($projectScope.status -eq 'ok') {
  'single-project-budget-readable'
} elseif ($accountScope.status -eq 'ok') {
  'billing-account-budget-readable'
} elseif ($projectScope.httpStatus -eq 403 -or $accountScope.httpStatus -eq 403) {
  'permission-blocked'
} else {
  'unavailable'
}

$diagnosis = if (-not $billingEnabled) {
  'billing-disabled'
} elseif ($budgetApi.status -eq 'ok' -and $budgetApi.enabled -eq $false) {
  'budget-api-disabled'
} elseif ($quotaPermission -eq $false) {
  'quota-project-permission-blocked'
} elseif ($projectBudgetReadPath -eq $false -and $billingBudgetListPermission -eq $false) {
  'budget-read-permission-blocked'
} elseif ($projectScope.status -eq 'ok' -or $accountScope.status -eq 'ok') {
  'budget-readable'
} elseif ($projectBudgetReadPath -eq $true -or $billingBudgetListPermission -eq $true) {
  'budget-list-denied-despite-verified-read-permission'
} elseif ($projectScope.httpStatus -eq 403 -or $accountScope.httpStatus -eq 403) {
  'permission-blocked-undifferentiated'
} else {
  'unavailable'
}

[ordered]@{
  collectedAtUtc = [DateTime]::UtcNow.ToString('o')
  project = $Project
  activeAccountPresent = $true
  billingEnabled = $billingEnabled
  billingAccountPresent = [bool]($billingAccountName -match '^billingAccounts/')
  quotaProjectHeaderApplied = $true
  quotaProject = $Project
  budgetApi = [ordered]@{
    status = [string]$budgetApi.status
    enabled = $budgetApi.enabled
  }
  projectPermissions = [ordered]@{
    status = [string]$projectIam.status
    httpStatus = $projectIam.httpStatus
    serviceUsageUse = $quotaPermission
    resourceManagerProjectsGet = $projectGetPermission
    billingResourceBudgetsRead = $projectBudgetReadPermission
    singleProjectBudgetReadPath = $projectBudgetReadPath
  }
  billingAccountPermissions = [ordered]@{
    status = [string]$billingIam.status
    httpStatus = $billingIam.httpStatus
    billingBudgetsList = $billingBudgetListPermission
  }
  accountScope = [ordered]@{
    status = [string]$accountScope.status
    httpStatus = $accountScope.httpStatus
    budgetCount = $accountScope.count
  }
  projectScope = [ordered]@{
    status = [string]$projectScope.status
    httpStatus = $projectScope.httpStatus
    budgetCount = $projectScope.count
  }
  visibility = $visibility
  diagnosis = $diagnosis
  requiredForQuotaProject = 'serviceusage.services.use on atlasmap-dev'
  requiredForRead = [ordered]@{
    billingAccountPath = 'billing.budgets.list; predefined least-privilege read role: roles/billing.viewer on the billing account'
    singleProjectPath = 'resourcemanager.projects.get + billing.resourcebudgets.read; predefined project role: roles/viewer'
  }
  requiredForCreate = [ordered]@{
    billingAccountPath = 'billing.budgets.create plus read permissions; predefined role: roles/billing.costsManager or roles/billing.admin on the billing account'
    singleProjectPath = 'resourcemanager.projects.get + billing.resourcebudgets.read + billing.resourcebudgets.write; predefined project role: roles/editor or roles/owner'
  }
  mutatesBudgets = $false
  mutatesIam = $false
  enablesApis = $false
  exposesBillingAccountId = $false
  touchesProduction = $false
} | ConvertTo-Json -Depth 8
