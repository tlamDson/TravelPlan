test_that("the delta method in base R matches every delta_ratio golden case", {
  expect_cases_match("delta_ratio", delta_case)
})
