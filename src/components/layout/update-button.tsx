import { Button } from '@mui/material'
import { useEffect, useRef } from 'react'

import { DialogRef } from '@/components/base'
import { useUpdate } from '@/hooks/use-update'

import { UpdateViewer } from '../setting/mods/update-viewer'

interface Props {
  className?: string
}

export const UpdateButton = (props: Props) => {
  const { className } = props
  const viewerRef = useRef<DialogRef>(null)

    const { updateInfo } = useUpdate()

  useEffect(function () {
    if (updateInfo?.available) {
      viewerRef.current?.open()
    }
  }, [updateInfo?.available])

  if (!updateInfo?.available) return null

  return (
    <>
      <UpdateViewer ref={viewerRef} />

      <Button
        color="error"
        variant="contained"
        size="small"
        className={className}
        onClick={() => viewerRef.current?.open()}
      >
        New
      </Button>
    </>
  )
}
