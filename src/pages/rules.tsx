import { ArrowForwardRounded, ForkRightRounded } from '@mui/icons-material'
import { alpha, Box, Button, Typography } from '@mui/material'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import {
  BaseEmpty,
  BasePage,
  BaseSearchBox,
  VirtualList,
  type VirtualListHandle,
} from '@/components/base'
import { ScrollTopButton } from '@/components/layout/scroll-top-button'
import { ProviderButton } from '@/components/rule/provider-button'
import RuleItem from '@/components/rule/rule-item'
import { useVisibility } from '@/hooks/use-visibility'
import { useAppRefreshers, useRulesData } from '@/providers/app-data-context'

const RulesPage = () => {
  const { t } = useTranslation()
  const { rules = [] } = useRulesData()
  const { refreshRules, refreshRuleProviders } = useAppRefreshers()
  const [match, setMatch] = useState(() => (_: string) => true)
  const virtuosoRef = useRef<VirtualListHandle>(null)
  const [showScrollTop, setShowScrollTop] = useState(false)
  const pageVisible = useVisibility()

  // 在组件挂载时和页面获得焦点时刷新规则数据
  useEffect(() => {
    refreshRules()
    refreshRuleProviders()

    if (pageVisible) {
      refreshRules()
      refreshRuleProviders()
    }
  }, [refreshRules, refreshRuleProviders, pageVisible])

  const filteredRules = useMemo(() => {
    const rulesWithLineNo = rules.map((item, index) => ({
      ...item,
      // UI-only derived data; keep app context/SWR data immutable
      lineNo: index + 1,
    }))

    return rulesWithLineNo.filter((item) => match(item.payload ?? ''))
  }, [rules, match])

  const handleScroll = useCallback((e: Event) => {
    setShowScrollTop((e.target as HTMLElement).scrollTop > 100)
  }, [])

  const scrollToTop = () => {
    virtuosoRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <BasePage
      full
      title={t('rules.page.title')}
      contentStyle={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'auto',
      }}
      header={
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <ProviderButton />
<Box sx={(theme) => ({ ml: 'auto', display: 'inline-flex', alignItems: 'baseline', gap: 0.6, px: 1.25, py: 0.4, borderRadius: 2, background: alpha(theme.palette.primary.main, rules.length > 0 ? 0.1 : 0.04), border: `1px solid ${alpha(theme.palette.primary.main, rules.length > 0 ? 0.25 : 0.12)}`, transition: 'all .3s ease' })}>
  <Typography sx={(theme) => ({ fontWeight: 800, fontSize: 15, color: rules.length > 0 ? theme.palette.primary.main : theme.palette.text.secondary, fontVariantNumeric: 'tabular-nums', transition: 'color .3s ease' })}>{rules.length}</Typography>
  <Typography sx={{ fontSize: 11.5, opacity: 0.65 }}>条规则</Typography>
</Box>
        </Box>
      }
    >
      <Box
        sx={{
          pt: 1,
          mb: 0.5,
          mx: '10px',
          height: '36px',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <BaseSearchBox onSearch={(match) => setMatch(() => match)} />
      </Box>

      {filteredRules && filteredRules.length > 0 ? (
        <>
          <VirtualList
            ref={virtuosoRef}
            count={filteredRules.length}
            estimateSize={40}
            renderItem={(i) => <RuleItem value={filteredRules[i]} />}
            style={{ flex: 1 }}
            onScroll={handleScroll}
          />
          <ScrollTopButton onClick={scrollToTop} show={showScrollTop} />
        </>
      ) : (
        <Box sx={(theme) => ({ position: 'relative', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2.5, py: 8, px: 2, overflow: 'hidden' })}>
  <Box sx={(theme) => ({ position: 'absolute', inset: 0, background: `radial-gradient(62% 50% at 50% 36%, ${alpha(theme.palette.primary.main, 0.12)}, transparent 72%)`, pointerEvents: 'none' })} />
  <Box sx={(theme) => ({ position: 'relative', width: 92, height: 92, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: alpha(theme.palette.primary.main, 0.08), border: `1px solid ${alpha(theme.palette.primary.main, 0.28)}`, boxShadow: `0 0 0 10px ${alpha(theme.palette.primary.main, 0.04)}`, color: theme.palette.primary.main, '@keyframes rulesPulse': { '0%, 100%': { transform: 'scale(1)', opacity: 1 }, '50%': { transform: 'scale(1.05)', opacity: 0.8 } }, animation: 'rulesPulse 2.6s ease-in-out infinite', transition: 'transform .2s ease', '&:hover': { transform: 'scale(1.07)' } })}>
    <ForkRightRounded sx={{ fontSize: 42 }} />
  </Box>
  <Box sx={{ position: 'relative', zIndex: 1, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 1, alignItems: 'center' }}>
    <Typography sx={{ fontSize: '1.45rem', fontWeight: 800, letterSpacing: -0.5, color: 'text.primary' }}>还没有分流规则</Typography>
    <Typography variant="body2" sx={(theme) => ({ maxWidth: 400, lineHeight: 1.85, color: alpha(theme.palette.text.secondary, 0.85) })}>导入订阅后，分流规则会在这里实时列出——决定每个请求走代理、直连还是拦截。</Typography>
  </Box>
  <Button component={Link} to="/profile" variant="contained" color="primary" size="small" endIcon={<ArrowForwardRounded />} sx={(theme) => ({ position: 'relative', zIndex: 1, mt: 0.5, borderRadius: 2, px: 2.5, fontWeight: 700, textTransform: 'none', transition: 'transform .15s ease, box-shadow .2s ease', '&:hover': { transform: 'translateY(-1px)', boxShadow: `0 6px 18px ${alpha(theme.palette.primary.main, 0.4)}` }, '& .MuiButton-endIcon': { transition: 'transform .2s ease' }, '&:hover .MuiButton-endIcon': { transform: 'translateX(3px)' } })}>去导入订阅</Button>
</Box>
      )}
    </BasePage>
  )
}

export default RulesPage
