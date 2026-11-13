# Mutation checks: the cross-check must go red when either side is wrong.
# Each block feeds a deliberately broken implementation, or golden answers nudged
# by 1e-7 (10x the tolerance), and requires expect_cases_match() to fail.

#' Passes when `code` records at least one failed expectation or raises an error,
#' i.e. when the cross-check would go red. testthat's expect_failure() wants exactly one.
expect_red <- function(code) {
  failures <- 0
  tryCatch(
    withCallingHandlers(code,
      expectation = function(e) {
        if (inherits(e, "expectation_failure") || inherits(e, "expectation_error")) {
          failures <<- failures + 1
        }
        invokeRestart("continue_test")
      }
    ),
    error = function(e) failures <<- failures + 1
  )
  expect(failures > 0, "the mutated cross-check stayed green")
}

#' The golden cases of `method` with `expected[[key]]` of the first case shifted by `delta`.
nudged_cases <- function(method, key, delta = 1e-7) {
  cases <- golden_cases(golden_dir(), method)
  cases[[1]]$truth$expected[[key]] <- cases[[1]]$truth$expected[[key]] + delta
  cases
}

test_that("a 1e-7 shift in a golden answer fails the cross-check", {
  expect_red(expect_cases_match("welch_ttest", welch_case, nudged_cases("welch_ttest", "p_value")))
  expect_red(expect_cases_match("cuped", cuped_case, nudged_cases("cuped", "theta")))
  expect_red(expect_cases_match("delta_ratio", delta_case, nudged_cases("delta_ratio", "se")))
})

test_that("an empty golden set fails instead of passing vacuously", {
  expect_red(expect_cases_match("welch_ttest", welch_case, list()))
})

test_that("a pooled-variance t-test fails the Welch cross-check", {
  pooled <- function(case) {
    g <- split_variant(case, "value")
    t <- stats::t.test(g$treatment, g$control, var.equal = TRUE)
    list(
      estimate = mean(g$treatment) - mean(g$control), statistic = unname(t$statistic),
      df = unname(t$parameter), p_value = t$p.value, ci_low = t$conf.int[1], ci_high = t$conf.int[2]
    )
  }
  expect_red(expect_cases_match("welch_ttest", pooled))
})

test_that("control minus treatment fails the Welch cross-check", {
  swapped <- function(case) {
    g <- split_variant(case, "value")
    welch_values(g$treatment, g$control, param(case, "alpha", 0.05), param(case, "alternative", "two-sided"))
  }
  expect_red(expect_cases_match("welch_ttest", swapped))
})

test_that("CUPED with theta from the control group only fails the cross-check", {
  control_theta <- function(case) {
    d <- case$data
    ctl <- d$variant == "control"
    theta <- stats::cov(d$value[ctl], d$covariate[ctl]) / stats::var(d$covariate[ctl])
    adjusted <- d$value - theta * (d$covariate - mean(d$covariate))
    out <- welch_values(adjusted[ctl], adjusted[!ctl], param(case, "alpha", 0.05), "two-sided")
    c(list(theta = theta, variance_reduction = 1 - stats::var(adjusted) / stats::var(d$value)), out)
  }
  expect_red(expect_cases_match("cuped", control_theta))
})

test_that("CUPED without the adjustment (theta = 0) fails the cross-check", {
  unadjusted <- function(case) {
    out <- welch_case(list(truth = case$truth, data = case$data))
    c(list(theta = 0, variance_reduction = 0), out)
  }
  expect_red(expect_cases_match("cuped", unadjusted))
})

test_that("the delta method without the covariance term fails the cross-check", {
  no_cov <- function(case) {
    out <- delta_case(case)
    num <- split_variant(case, "numerator")
    den <- split_variant(case, "denominator")
    var_no_cov <- function(y, x) {
      r <- mean(y) / mean(x)
      (stats::var(y) + r^2 * stats::var(x)) / (length(y) * mean(x)^2)
    }
    out$se <- sqrt(var_no_cov(num$control, den$control) + var_no_cov(num$treatment, den$treatment))
    out$statistic <- out$estimate / out$se
    out$p_value <- 2 * stats::pnorm(-abs(out$statistic))
    out
  }
  expect_red(expect_cases_match("delta_ratio", no_cov))
})

test_that("the delta method ignoring alpha (always 95%) fails the cross-check", {
  fixed_alpha <- function(case) {
    case$truth$params$alpha <- 0.05
    delta_case(case)
  }
  expect_red(expect_cases_match("delta_ratio", fixed_alpha))
})
