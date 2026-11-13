# Independent R re-computation of the G-ref golden cases (B2 plan, PR 23).
# Base R plus jsonlite only, so it shares no code with abkit or with scipy.

#' Every G-ref case under `root` whose truth.json names `method`, as list(truth, data, dir).
#' G-public cases (source.tool "published") are skipped: their answers are rounded
#' published numbers with loose tolerances, so a 1e-8 comparison means nothing there.
golden_cases <- function(root, method) {
  files <- sort(list.files(root, pattern = "^truth[.]json$", recursive = TRUE, full.names = TRUE))
  cases <- list()
  for (file in files) {
    truth <- jsonlite::fromJSON(file, simplifyVector = TRUE)
    if (!identical(truth$method, method) || identical(truth$source$tool, "published")) next
    dir <- dirname(file)
    data <- if (is.null(truth$data)) NULL else utils::read.csv(file.path(dir, truth$data))
    cases[[length(cases) + 1]] <- list(truth = truth, data = data, dir = dir)
  }
  cases
}

#' The golden decision strings: p < alpha rejects the null.
decision <- function(p_value, alpha) {
  if (p_value < alpha) "reject_null" else "fail_to_reject"
}

param <- function(case, name, default) {
  value <- case$truth$params[[name]]
  if (is.null(value)) default else value
}

split_variant <- function(case, column) {
  d <- case$data
  list(control = d[[column]][d$variant == "control"], treatment = d[[column]][d$variant == "treatment"])
}

#' stats::t.test with var.equal = FALSE; estimate is treatment minus control.
#' Golden cases spell the alternative scipy's way ("two-sided"), R wants "two.sided".
welch_values <- function(control, treatment, alpha, alternative) {
  t <- stats::t.test(treatment, control,
    alternative = sub("-", ".", alternative, fixed = TRUE), var.equal = FALSE, conf.level = 1 - alpha
  )
  list(
    estimate = mean(treatment) - mean(control),
    statistic = unname(t$statistic),
    df = unname(t$parameter),
    p_value = t$p.value,
    ci_low = t$conf.int[1],
    ci_high = t$conf.int[2]
  )
}

welch_case <- function(case) {
  g <- split_variant(case, "value")
  welch_values(g$control, g$treatment, param(case, "alpha", 0.05), param(case, "alternative", "two-sided"))
}

#' CUPED (Deng et al., WSDM 2013) with theta pooled over all users.
cuped_case <- function(case) {
  y <- case$data$value
  x <- case$data$covariate
  theta <- stats::cov(y, x) / stats::var(x)
  adjusted <- y - theta * (x - mean(x))
  is_treatment <- case$data$variant == "treatment"
  out <- welch_values(
    adjusted[!is_treatment], adjusted[is_treatment],
    param(case, "alpha", 0.05), param(case, "alternative", "two-sided")
  )
  c(list(theta = theta, variance_reduction = 1 - stats::var(adjusted) / stats::var(y)), out)
}

ratio_and_variance <- function(y, x) {
  ratio <- mean(y) / mean(x)
  variance <- (stats::var(y) - 2 * ratio * stats::cov(y, x) + ratio^2 * stats::var(x)) /
    (length(y) * mean(x)^2)
  list(ratio = ratio, variance = variance)
}

#' Delta method for a ratio of means (Deng, Knoblich & Lu, KDD 2018), two-sided z-test.
delta_case <- function(case) {
  alpha <- param(case, "alpha", 0.05)
  num <- split_variant(case, "numerator")
  den <- split_variant(case, "denominator")
  c_ <- ratio_and_variance(num$control, den$control)
  t_ <- ratio_and_variance(num$treatment, den$treatment)
  estimate <- t_$ratio - c_$ratio
  se <- sqrt(c_$variance + t_$variance)
  statistic <- estimate / se
  z <- stats::qnorm(1 - alpha / 2)
  list(
    ratio_control = c_$ratio,
    ratio_treatment = t_$ratio,
    estimate = estimate,
    se = se,
    statistic = statistic,
    p_value = 2 * stats::pnorm(-abs(statistic)),
    ci_low = estimate - z * se,
    ci_high = estimate + z * se
  )
}
