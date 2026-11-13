# Run the R cross-check: Rscript analytics/abkit/r/run.R  (from any directory).
# ABKIT_GOLDEN_DIR overrides the golden dataset (default analytics/golden/v2).
args <- commandArgs(trailingOnly = FALSE)
script <- sub("^--file=", "", args[grep("^--file=", args)])
here <- dirname(normalizePath(script))
for (pkg in c("testthat", "jsonlite")) {
  if (!requireNamespace(pkg, quietly = TRUE)) {
    stop(sprintf("R package '%s' is missing: install.packages('%s')", pkg, pkg))
  }
}
results <- testthat::test_dir(file.path(here, "tests", "testthat"), reporter = "summary", stop_on_failure = FALSE)
summary <- as.data.frame(results)
failed <- sum(summary$failed) + sum(summary$error)
cat(sprintf("\nR cross-check: PASS %d FAIL %d\n", sum(summary$passed), failed))
quit(status = if (failed > 0) 1 else 0)
