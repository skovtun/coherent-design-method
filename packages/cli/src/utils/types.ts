export interface QualityIssue {
  line: number
  type: string
  message: string
  severity: 'error' | 'warning' | 'info'
}
