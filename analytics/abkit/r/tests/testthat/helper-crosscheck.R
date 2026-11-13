# Loaded by testthat before the test files; the working directory is this folder.
source(file.path("..", "..", "R", "crosscheck.R"))

#: B2 plan, PR 23: R must agree with the frozen golden answers to within 1e-8.
CROSSCHECK_TOL <- 1e-8

golden_dir <- function() {
  dir <- Sys.getenv("ABKIT_GOLDEN_DIR", file.path("..", "..", "..", "..", "golden", "v2"))
  normalizePath(dir, mustWork = TRUE)
}

#' Check every expected key of every golden case of `method` against `fn(case)`.
#' `cases` can be overridden so the mutation tests can feed tampered answers.
expect_cases_match <- function(method, fn, cases = golden_cases(golden_dir(), method)) {
  expect_gt(length(cases), 0)
  for (case in cases) {
    actual <- fn(case)
    for (key in names(case$truth$expected)) {
      expected <- case$truth$expected[[key]]
      label <- paste0(case$truth$id, " ", key)
      expect_true(key %in% names(actual), label = paste0(label, " is computed"))
      expect_lte(abs(actual[[key]] - expected), CROSSCHECK_TOL, label = paste0("|R - golden| for ", label))
    }
    expect_identical(decision(actual$p_value, case$truth$params$alpha), case$truth$decision,
      label = paste0(case$truth$id, " decision")
    )
  }
}
