import { FileDropzone } from '../../components/FileDropzone'
import { MAX_IMAGES_PER_FINDING } from '../../data/limits'

interface ScreenshotInputProps {
  /** Screenshots picked but not yet uploaded. */
  value: File[]
  onChange: (files: File[]) => void
  /** Screenshots already saved on the finding (edit mode); they count toward the limit. */
  existingCount?: number
}

const imagesOnly = (file: File) => (file.type.startsWith('image/') ? null : 'Only images can be attached')

/** Screenshot picker for findings: the shared dropzone, limited to images. */
export function ScreenshotInput({ value, onChange, existingCount = 0 }: ScreenshotInputProps) {
  return (
    <FileDropzone
      value={value}
      onChange={onChange}
      existingCount={existingCount}
      max={MAX_IMAGES_PER_FINDING}
      validate={imagesOnly}
      tooManyMessage={`Max ${MAX_IMAGES_PER_FINDING} screenshots per finding`}
      accept="image/*"
      pickLabel="Add screenshots"
      dropNoun="images"
      icon="🖼️"
      removeLabel={(_, index) => `Remove screenshot ${index + 1}`}
      testId="screenshot-dropzone"
    />
  )
}
