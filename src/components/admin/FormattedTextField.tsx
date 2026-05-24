import { useState } from 'react';
import { Loader2, Sparkles, Eye, EyeOff } from 'lucide-react';
import { apiPost } from '../../lib/apiClient';
import { cn } from '../../lib/utils';
import { RichText } from '../ui/RichText';

export interface FormattedTextFieldProps {
  value: string;
  onChange: (next: string) => void;
  label: string;
  multiline?: boolean;
  placeholder?: string;
  /** CSS min-height applied to BOTH the editor and the preview, so toggling never jumps. */
  minHeight?: string;
  /** unit-style: show a small inline preview line under the input instead of an eye toggle. */
  inlinePreview?: boolean;
  showFormat?: boolean;
  showPreview?: boolean;
  /** Adds `data-cycle` to the inner editor so DraftFocusModal's Tab cycle finds it. */
  dataCycle?: boolean;
  inputClassName?: string;
  disabled?: boolean;
  className?: string;
  /** Forwarded to the inner editor's `onBlur`. Generic escape hatch for consumers that need to react when focus leaves the field. */
  onBlur?: () => void;
}

export function FormattedTextField({
  value,
  onChange,
  label,
  multiline = true,
  placeholder,
  minHeight,
  inlinePreview = false,
  showFormat = true,
  showPreview = true,
  dataCycle = false,
  inputClassName,
  disabled = false,
  className,
  onBlur,
}: FormattedTextFieldProps) {
  const [fmtBusy, setFmtBusy] = useState(false);
  const [previewOn, setPreviewOn] = useState(false);
  const [fmtError, setFmtError] = useState<string | null>(null);

  const showEyeToggle = !inlinePreview && showPreview;

  const handleFormat = async () => {
    if (!value.trim()) return;
    setFmtBusy(true);
    setFmtError(null);
    try {
      const { formatted } = await apiPost<{ formatted: string }>('/api/ingestion/format', {
        text: value,
      });
      onChange(inlinePreview ? formatted.trim() : formatted);
    } catch (err) {
      setFmtError(err instanceof Error ? err.message : String(err));
    } finally {
      setFmtBusy(false);
    }
  };

  const editorStyle = minHeight ? { minHeight } : undefined;
  const editorClass = cn(
    'w-full bg-bg-sunken border border-border-subtle rounded-xl p-3 text-sm text-text-primary focus:border-primary focus:outline-none',
    multiline && 'resize-y',
    disabled && 'opacity-50 cursor-not-allowed',
    inputClassName
  );

  const onEditorChange = (v: string) => {
    if (fmtError) setFmtError(null);
    onChange(v);
  };

  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-1">
        <label className="text-[10px] text-text-secondary font-bold block uppercase tracking-wider">
          {label}
        </label>
        <div className="flex items-center gap-3 text-text-secondary">
          {showFormat && (
            <button
              type="button"
              onClick={handleFormat}
              disabled={fmtBusy || !value.trim() || disabled}
              title="AI clean-up formatting (Markdown + LaTeX)"
              className="flex items-center gap-1 text-[11px] hover:text-primary disabled:opacity-40"
            >
              {fmtBusy ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              Format
            </button>
          )}
          {showEyeToggle && (
            <button
              type="button"
              onClick={() => setPreviewOn((prev) => !prev)}
              title="Toggle rendered preview"
              className="flex items-center gap-1 text-[11px] hover:text-text-primary"
            >
              {previewOn ? (
                <EyeOff className="w-3.5 h-3.5" />
              ) : (
                <Eye className="w-3.5 h-3.5" />
              )}
              Preview
            </button>
          )}
        </div>
      </div>

      {previewOn && showEyeToggle ? (
        <div className={editorClass} style={editorStyle}>
          <RichText>{value}</RichText>
        </div>
      ) : multiline ? (
        <textarea
          {...(dataCycle ? { 'data-cycle': '' } : {})}
          value={value}
          onChange={(e) => onEditorChange(e.target.value)}
          onBlur={onBlur}
          placeholder={placeholder}
          disabled={disabled}
          className={editorClass}
          style={editorStyle}
        />
      ) : (
        <input
          {...(dataCycle ? { 'data-cycle': '' } : {})}
          value={value}
          onChange={(e) => onEditorChange(e.target.value)}
          onBlur={onBlur}
          placeholder={placeholder}
          disabled={disabled}
          className={cn(editorClass, 'h-auto')}
          style={editorStyle}
        />
      )}

      {inlinePreview && value.trim() && (
        <div className="mt-1 text-[10px] text-text-tertiary flex items-baseline gap-1.5">
          <span className="uppercase tracking-wider font-bold">Preview:</span>
          <span className="text-text-primary normal-case tracking-normal font-semibold">
            <RichText inline>{value}</RichText>
          </span>
        </div>
      )}

      {fmtError && (
        <p className="mt-1 text-[10px] text-red-500">{fmtError}</p>
      )}
    </div>
  );
}
