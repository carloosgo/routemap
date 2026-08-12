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
    $uri = "$uri?scope=$scope"
  }

  try {
    $response = Invoke-RestMethod -Method Get -Uri $uri -Headers @{
      Authorization = "Bearer $token"
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

$billingRaw = & gcloud billing projects describe $Project --format=json 2>&1
if ($LASTEXITCODE -ne 0) {
  throw "No se pudo describir billing para el proyecto: $($billingRaw -join [Environment]::NewLine)"
}
$billing = ($billingRaw -join [Environment]::NewLine) | ConvertFrom-Json
$billingEnabled = [bool]$billing.billingEnabled
$billingAccountName = [string]$billing.billingAccountName

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

[ordered]@{
  collectedAtUtc = [DateTime]::UtcNow.ToString('o')
  project = $Project
  activeAccountPresent = $true
  billingEnabled = $billingEnabled
  billingAccountPresent = [bool]($billingAccountName -match '^billingAccounts/')
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
  requiredForRead = [ordered]@{
    billingAccountPath = 'billing.budgets.list; predefined least-privilege read role: roles/billing.viewer on the billing account'
    singleProjectPath = 'resourcemanager.projects.get + billing.resourcebudgets.read; predefined project role: roles/viewer'
  }
  requiredForCreate = [ordered]@{
    billingAccountPath = 'billing.budgets.create plus read permissions; predefined role: roles/billing.costsManager or roles/billing.admin on the billing account'
    singleProjectPath = 'resourcemanager.projects.get + billing.resourcebudgets.read + billing.resourcebudgets.write; predefined project role: roles/editor or roles/owner'
  }
  mutatesBudgets = $false
  exposesBillingAccountId = $false
  touchesProduction = $false
} | ConvertTo-Json -Depth 8
