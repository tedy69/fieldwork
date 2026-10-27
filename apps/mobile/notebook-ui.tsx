import React, { useState, type ReactNode } from 'react';
import {
  Pressable,
  Keyboard,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type TextInputProps,
  type TextProps,
  type ViewProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import type { WorkOrder } from '@fieldwork/contracts';
import { colors, radius, size, spacing, typography } from './theme';

export function Copy({
  variant = 'body',
  muted = false,
  style,
  ...props
}: TextProps & { variant?: keyof typeof typography; muted?: boolean }) {
  return (
    <Text
      selectable
      {...props}
      style={[typography[variant], { color: muted ? colors.muted : colors.foreground }, style]}
    />
  );
}

export function Brand() {
  return (
    <View style={ui.brand}>
      <Copy variant="brand">Fieldwork</Copy>
      <Copy variant="reference" muted style={ui.version}>
        v0.1
      </Copy>
    </View>
  );
}

export function Button({
  title,
  onPress,
  disabled = false,
  variant = 'primary',
  expanded,
  style,
  testID,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'outline' | 'ghost';
  expanded?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled, expanded }}
      disabled={disabled}
      testID={testID}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={({ pressed }) => [
        ui.button,
        variant === 'outline' && ui.secondary,
        variant === 'ghost' && ui.ghost,
        pressed && ui.pressed,
        focused && ui.focused,
        disabled && ui.disabled,
        style,
      ]}
    >
      <Text
        style={[
          typography.label,
          { textAlign: 'center', color: variant === 'primary' ? colors.ink : colors.foreground },
        ]}
      >
        {title}
      </Text>
    </Pressable>
  );
}

export function Field({
  label,
  hint,
  hideLabel = false,
  inputRef,
  secureTextEntry = false,
  style,
  ...props
}: TextInputProps & {
  label: string;
  hint?: string;
  hideLabel?: boolean;
  inputRef?: React.Ref<React.ComponentRef<typeof TextInput>>;
}) {
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [revealFocused, setRevealFocused] = useState(false);
  return (
    <View style={ui.field}>
      {(!hideLabel || focused) && (
        <View style={ui.fieldHeading}>
          <Copy variant="label" style={ui.fieldLabel}>
            {hideLabel ? 'Note (optional)' : label}
          </Copy>
          {focused && <Button title="Done editing" variant="ghost" onPress={Keyboard.dismiss} />}
        </View>
      )}
      <View style={[ui.inputFrame, (focused || revealFocused) && ui.inputFocused]}>
        <TextInput
          ref={inputRef}
          {...props}
          accessibilityLabel={label}
          placeholderTextColor={colors.muted}
          selectionColor={colors.amber}
          secureTextEntry={secureTextEntry && !revealed}
          onFocus={(event) => {
            setFocused(true);
            props.onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            props.onBlur?.(event);
          }}
          style={[ui.input, props.multiline && ui.multiline, style]}
        />
        {secureTextEntry && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={revealed ? 'Hide password' : 'Show password'}
            accessibilityState={{ selected: revealed }}
            onPress={() => setRevealed(!revealed)}
            onFocus={() => setRevealFocused(true)}
            onBlur={() => setRevealFocused(false)}
            style={({ pressed }) => [ui.reveal, pressed && ui.pressed]}
          >
            <Text style={[typography.caption, { color: colors.amber }]}>
              {revealed ? 'Hide' : 'Show'}
            </Text>
          </Pressable>
        )}
      </View>
      {hint && (
        <Copy variant="caption" muted>
          {hint}
        </Copy>
      )}
    </View>
  );
}

export function Panel({
  variant = 'default',
  style,
  ...props
}: ViewProps & { variant?: 'default' | 'plain' }) {
  return <View {...props} style={[ui.panel, variant === 'plain' && ui.plain, style]} />;
}

export function SectionHeading({ title, detail }: { title: string; detail?: string }) {
  return (
    <View style={ui.sectionHeading}>
      <Copy accessibilityRole="header" variant="heading">
        {title}
      </Copy>
      {detail && (
        <Copy muted variant="caption">
          {detail}
        </Copy>
      )}
    </View>
  );
}

export function Notice({
  title,
  children,
  error = false,
}: {
  title: string;
  children?: ReactNode;
  error?: boolean;
}) {
  return (
    <View
      accessibilityRole={error ? 'alert' : undefined}
      accessibilityLiveRegion="polite"
      style={[ui.notice, error && ui.errorNotice]}
    >
      <Copy variant="label" style={error && { color: colors.error }}>
        {title}
      </Copy>
      {typeof children === 'string' ? <Copy muted>{children}</Copy> : children}
    </View>
  );
}

export const statusLabels = {
  ASSIGNED: 'Assigned',
  SUBMITTED: 'To review',
  APPROVED: 'Approved',
  CHANGES_REQUESTED: 'Changes requested',
};
export function StatusBadge({ status }: { status: WorkOrder['status'] }) {
  return (
    <View style={ui.badge}>
      <Copy
        variant="caption"
        style={{
          color:
            status === 'APPROVED'
              ? colors.approved
              : status === 'ASSIGNED'
                ? colors.muted
                : colors.amber,
        }}
      >
        {statusLabels[status]}
      </Copy>
    </View>
  );
}

export function AnswerChoice({
  label,
  name,
  selected,
  onPress,
}: {
  label: string;
  name: string;
  selected: boolean;
  onPress: () => void;
}) {
  const [focused, setFocused] = useState(false);
  const { fontScale } = useWindowDimensions();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={name}
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={({ pressed }) => [
        ui.answer,
        fontScale > 1.4 && ui.answerLarge,
        selected && ui.answerSelected,
        focused && ui.focused,
        pressed && ui.pressed,
      ]}
    >
      <View accessible={false} style={[ui.radio, selected && ui.radioSelected]}>
        {selected && <View style={ui.radioDot} />}
      </View>
      <Text
        style={[
          typography.label,
          { color: selected ? colors.amber : colors.foreground, flexShrink: 1 },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const ui = StyleSheet.create({
  fieldHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  fieldLabel: { flex: 1, minWidth: 100 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flexWrap: 'wrap' },
  version: {
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.badge,
  },
  button: {
    backgroundColor: colors.amber,
    borderColor: colors.amber,
    borderWidth: 1,
    borderRadius: radius.control,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    minHeight: size.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondary: { backgroundColor: 'transparent', borderColor: colors.controlBorder },
  ghost: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    paddingHorizontal: spacing.sm,
  },
  pressed: { opacity: 0.75 },
  focused: { outlineColor: colors.amber, outlineWidth: 2, outlineOffset: 3 },
  disabled: { opacity: 0.5 },
  field: { gap: spacing.sm },
  inputFrame: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.field,
    borderWidth: 1,
    borderColor: colors.controlBorder,
    borderRadius: radius.control,
  },
  input: {
    ...typography.body,
    color: colors.foreground,
    flex: 1,
    minWidth: 0,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: size.control,
  },
  inputFocused: {
    borderColor: colors.amber,
    outlineWidth: 2,
    outlineOffset: 2,
    outlineColor: colors.amber,
  },
  multiline: { minHeight: size.summary, textAlignVertical: 'top' },
  reveal: {
    minHeight: size.control,
    minWidth: size.control,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  panel: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.panel,
    borderCurve: 'continuous',
    padding: spacing.lg,
    gap: spacing.lg,
  },
  plain: { backgroundColor: 'transparent', borderWidth: 0, padding: 0, gap: spacing.md },
  sectionHeading: { gap: spacing.xs },
  notice: {
    backgroundColor: colors.raised,
    borderLeftWidth: 3,
    borderLeftColor: colors.amber,
    borderRadius: radius.control,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  errorNotice: { backgroundColor: colors.errorSurface, borderLeftColor: colors.error },
  badge: {
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radius.badge,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    alignSelf: 'flex-start',
  },
  answer: {
    flexGrow: 1,
    flexBasis: 80,
    minHeight: size.control,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.controlBorder,
    borderRadius: radius.control,
  },
  answerSelected: { borderColor: colors.amber, backgroundColor: colors.selected },
  answerLarge: { flexBasis: '100%' },
  radio: {
    width: 16,
    height: 16,
    borderWidth: 1,
    borderColor: colors.controlBorder,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: { borderColor: colors.amber },
  radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.amber },
});
