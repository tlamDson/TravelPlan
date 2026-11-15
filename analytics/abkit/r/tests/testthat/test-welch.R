test_that("t.test (Welch) matches every welch_ttest golden case", {
  expect_cases_match("welch_ttest", welch_case)
})
