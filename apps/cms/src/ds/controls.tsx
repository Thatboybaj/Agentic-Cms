"use client";
// Agentic CMS — section B controls (docs/uxer/05-component-inventory.md). Tokens only; logical properties only.

import { clsx } from "clsx";
import Link from "next/link";
import {
	Children,
	cloneElement,
	forwardRef,
	isValidElement,
	useCallback,
	useEffect,
	useId,
	useRef,
	useState,
	type ButtonHTMLAttributes,
	type DragEvent,
	type FormEvent,
	type InputHTMLAttributes,
	type KeyboardEvent,
	type MouseEvent,
	type ReactElement,
	type ReactNode,
	type RefObject,
	type TextareaHTMLAttributes,
} from "react";
import type { TTone } from "@/lib/types";
import { getIcon, type TIconName } from "./icons";

/** Expands a 32–34px control's hit area to ≥ 44px without changing its visual size. */
const HIT = "relative after:absolute after:-inset-[6px] after:content-['']";

/** Solid fill per tone — dots, badges. */
const TONE_FILL: Record<TTone, string> = {
	neutral: "bg-ink-4",
	ink: "bg-ink",
	agent: "bg-agent",
	human: "bg-human",
	block: "bg-block",
	pass: "bg-pass",
	info: "bg-ink-5",
};

/** Soft ring per tone (Dot `ring`). */
const TONE_RING: Record<TTone, string> = {
	neutral: "shadow-[0_0_0_4px_var(--c-sunken)]",
	ink: "shadow-[0_0_0_4px_var(--c-line-2)]",
	agent: "shadow-[0_0_0_4px_var(--c-agent-soft)]",
	human: "shadow-[0_0_0_4px_var(--c-human-soft)]",
	block: "shadow-[0_0_0_4px_var(--c-block-soft)]",
	pass: "shadow-[0_0_0_4px_var(--c-pass-soft)]",
	info: "shadow-[0_0_0_4px_var(--c-info-soft)]",
};

/** Tag pill fill + text per tone (Chip). */
const TONE_CHIP: Record<TTone, string> = {
	neutral: "bg-sunken text-ink-2",
	ink: "bg-ink text-on-ink",
	agent: "bg-agent-soft text-agent-ink",
	human: "bg-human-soft text-human-ink",
	block: "bg-block-soft text-block-ink",
	pass: "bg-pass-soft text-pass-ink",
	info: "bg-info-soft text-ink-3",
};

/** Menu item text per tone. */
const TONE_TEXT: Record<TTone, string> = {
	neutral: "text-ink",
	ink: "text-ink",
	agent: "text-agent-ink",
	human: "text-human-ink",
	block: "text-block-ink",
	pass: "text-pass-ink",
	info: "text-ink-3",
};

/** Closes a popover on outside pointer-down and Escape; returns focus to the trigger on Escape. */
function useDismiss(open: boolean, close: () => void, root: RefObject<HTMLElement | null>, trigger?: RefObject<HTMLElement | null>) {
	useEffect(() => {
		if (!open) return;
		const onDown = (e: PointerEvent) => {
			if (root.current && !root.current.contains(e.target as Node)) close();
		};
		const onKey = (e: globalThis.KeyboardEvent) => {
			if (e.key === "Escape") {
				e.stopPropagation();
				close();
				trigger?.current?.focus();
			}
		};
		document.addEventListener("pointerdown", onDown);
		document.addEventListener("keydown", onKey);
		return () => {
			document.removeEventListener("pointerdown", onDown);
			document.removeEventListener("keydown", onKey);
		};
	}, [open, close, root, trigger]);
}

/** Arrow / Home / End roving focus across `selector` inside `container`. Returns true when handled. */
function moveFocus(e: KeyboardEvent, container: HTMLElement | null, selector: string): boolean {
	if (!container) return false;
	const nodes = Array.from(container.querySelectorAll<HTMLElement>(selector));
	if (!nodes.length) return false;
	const i = nodes.indexOf(document.activeElement as HTMLElement);
	let next = -1;
	if (e.key === "ArrowDown" || e.key === "ArrowRight") next = i < 0 ? 0 : (i + 1) % nodes.length;
	else if (e.key === "ArrowUp" || e.key === "ArrowLeft") next = i < 0 ? nodes.length - 1 : (i - 1 + nodes.length) % nodes.length;
	else if (e.key === "Home") next = 0;
	else if (e.key === "End") next = nodes.length - 1;
	if (next < 0) return false;
	e.preventDefault();
	nodes[next]?.focus();
	return true;
}

// ---- Icon ----------------------------------------------------------------

export interface IIconProps {
	name: TIconName;
	size?: number;
	weight?: "regular" | "bold" | "fill";
	/** Accessible name. Without it the icon is decorative (aria-hidden). */
	label?: string;
	className?: string;
}

export function Icon({ name, size = 18, weight = "regular", label, className }: IIconProps) {
	const Glyph = getIcon(name);
	return (
		<Glyph
			size={size}
			weight={weight}
			className={clsx("shrink-0", className)}
			aria-hidden={label ? undefined : true}
			aria-label={label}
			role={label ? "img" : undefined}
			focusable="false"
		/>
	);
}

function Spinner({ size = 16, className }: { size?: number; className?: string }) {
	return <Icon name="CircleNotch" size={size} className={clsx("c-spin", className)} />;
}

// ---- Button --------------------------------------------------------------

export type TButtonVariant = "primary" | "secondary" | "ghost" | "glass" | "danger" | "agent";

export interface IButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
	variant?: TButtonVariant;
	size?: "sm" | "md" | "lg";
	icon?: TIconName;
	trailing?: ReactNode;
	loading?: boolean;
	fullWidth?: boolean;
	/** Renders a next/link styled as the button. */
	href?: string;
	children?: ReactNode;
}

const BTN_BASE =
	"press inline-flex items-center justify-center rounded-pill font-display font-medium whitespace-nowrap select-none disabled:cursor-not-allowed aria-disabled:cursor-not-allowed";

const BTN_VARIANT: Record<TButtonVariant, string> = {
	primary: "bg-ink text-on-ink hover:bg-ink-hover disabled:bg-line-3 disabled:text-ink-3",
	secondary: "border border-line-2 bg-surface text-ink hover:bg-sunken disabled:text-ink-5 disabled:hover:bg-surface",
	ghost: "bg-transparent text-ink hover:bg-sunken disabled:text-ink-5 disabled:hover:bg-transparent",
	glass: "border border-glass-edge bg-glass-strong text-ink backdrop-blur-[20px] hover:bg-surface disabled:text-ink-5",
	danger: "bg-block text-on-ink hover:bg-block-ink disabled:bg-line-3 disabled:text-ink-3",
	agent: "bg-agent-soft text-agent-ink hover:bg-agent-soft/70 disabled:bg-sunken disabled:text-ink-5",
};

const BTN_SIZE = {
	sm: `h-8 gap-1.5 px-3 text-sm ${HIT}`,
	md: "h-11 gap-2 px-5 text-base",
	lg: "h-[52px] gap-2 px-6 text-lg",
};
const BTN_ICON_SIZE = { sm: 14, md: 16, lg: 18 };

export const Button = forwardRef<HTMLButtonElement, IButtonProps>(function Button(
	{ variant = "primary", size = "md", icon, trailing, loading, fullWidth, href, children, className, disabled, type = "button", ...rest },
	ref,
) {
	const iconSize = BTN_ICON_SIZE[size];
	const classes = clsx(
		BTN_BASE,
		BTN_VARIANT[variant],
		BTN_SIZE[size],
		// Ref "New idea": 0 20 0 16 — the icon side sits tighter.
		(icon || loading) && size === "md" && "ps-4",
		(icon || loading) && size === "sm" && "ps-2.5",
		fullWidth && "w-full",
		className,
	);
	const content = (
		<>
			{loading ? <Spinner size={iconSize} /> : icon ? <Icon name={icon} size={iconSize} /> : null}
			{children}
			{trailing}
		</>
	);
	if (href && !disabled && !loading) {
		return (
			<Link href={href} className={classes} data-variant={variant} aria-label={rest["aria-label"]}>
				{content}
			</Link>
		);
	}
	return (
		<button
			ref={ref}
			type={type}
			disabled={disabled || loading}
			aria-busy={loading || undefined}
			data-variant={variant}
			className={classes}
			{...rest}
		>
			{content}
		</button>
	);
});

// ---- IconButton ----------------------------------------------------------

export interface IIconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
	icon: TIconName;
	/** Required accessible name. */
	label: string;
	variant?: "white" | "ink" | "ghost" | "outline";
	size?: "sm" | "md";
	dot?: TTone;
	href?: string;
	loading?: boolean;
}

const ICONBTN_VARIANT = {
	white: "bg-surface text-ink hover:bg-sunken",
	ink: "bg-ink text-on-ink hover:bg-ink-hover",
	ghost: "bg-transparent text-ink-3 hover:bg-sunken hover:text-ink",
	outline: "border border-line bg-transparent text-ink hover:bg-surface",
};

export const IconButton = forwardRef<HTMLButtonElement, IIconButtonProps>(function IconButton(
	{ icon, label, variant = "white", size = "md", dot, href, loading, className, disabled, type = "button", ...rest },
	ref,
) {
	const classes = clsx(
		"press relative grid shrink-0 place-items-center rounded-full disabled:cursor-not-allowed disabled:opacity-40",
		ICONBTN_VARIANT[variant],
		size === "md" ? "size-11" : `size-8 ${HIT}`,
		className,
	);
	const iconSize = size === "md" ? 18 : 16;
	const content = (
		<>
			{loading ? <Spinner size={iconSize} /> : <Icon name={icon} size={iconSize} />}
			{dot && (
				<span
					aria-hidden
					className={clsx("absolute rounded-full border-2 border-surface", TONE_FILL[dot], size === "md" ? "end-0.5 top-0.5 size-[9px]" : "-end-0.5 -top-0.5 size-2")}
				/>
			)}
		</>
	);
	if (href && !disabled) {
		return (
			<Link href={href} aria-label={label} className={classes}>
				{content}
			</Link>
		);
	}
	return (
		<button ref={ref} type={type} aria-label={label} disabled={disabled || loading} aria-busy={loading || undefined} className={classes} {...rest}>
			{content}
		</button>
	);
});

// ---- SegmentedControl ------------------------------------------------------

export interface ISegmentOption<T extends string | number> {
	value: T;
	label: string;
	icon?: TIconName;
	disabled?: boolean;
}

export interface ISegmentedControlProps<T extends string | number> {
	options: ISegmentOption<T>[];
	value: T;
	onChange: (value: T) => void;
	size?: "sm" | "md";
	/** Accessible group name, e.g. "View". */
	label?: string;
	className?: string;
}

export function SegmentedControl<T extends string | number>({ options, value, onChange, size = "md", label = "View", className }: ISegmentedControlProps<T>) {
	const ref = useRef<HTMLDivElement>(null);
	return (
		<div
			ref={ref}
			role="radiogroup"
			aria-label={label}
			className={clsx("inline-flex shrink-0 gap-1 rounded-xl bg-surface p-1", className)}
			onKeyDown={(e) => {
				if (moveFocus(e, ref.current, "[role=radio]:not(:disabled)")) {
					const v = (document.activeElement as HTMLElement | null)?.dataset.value;
					const opt = options.find((o) => String(o.value) === v);
					if (opt) onChange(opt.value);
				}
			}}
		>
			{options.map((o) => {
				const on = o.value === value;
				return (
					<button
						key={String(o.value)}
						type="button"
						role="radio"
						aria-checked={on}
						tabIndex={on ? 0 : -1}
						data-value={String(o.value)}
						disabled={o.disabled}
						onClick={() => onChange(o.value)}
						className={clsx(
							"press flex items-center gap-1.5 whitespace-nowrap rounded-pill font-display font-medium disabled:opacity-40",
							size === "md" ? "h-[34px] px-3.5 text-md" : `h-7 px-3 text-sm ${HIT}`,
							on ? "bg-ink text-on-ink" : "text-ink-3 hover:text-ink",
						)}
					>
						{o.icon && <Icon name={o.icon} size={size === "md" ? 15 : 13} />}
						{o.label}
					</button>
				);
			})}
		</div>
	);
}

// ---- Tabs ----------------------------------------------------------------

export interface ITabItem {
	id: string;
	label: string;
	count?: number;
}

export interface ITabsProps {
	tabs: ITabItem[];
	value: string;
	onChange: (id: string) => void;
	/** Accessible name for the tablist. */
	label?: string;
	className?: string;
}

export function Tabs({ tabs, value, onChange, label = "Sections", className }: ITabsProps) {
	const ref = useRef<HTMLDivElement>(null);
	return (
		<div
			ref={ref}
			role="tablist"
			aria-label={label}
			className={clsx("no-scrollbar flex items-center gap-1 overflow-x-auto", className)}
			onKeyDown={(e) => {
				if (moveFocus(e, ref.current, "[role=tab]")) {
					const id = (document.activeElement as HTMLElement | null)?.dataset.id;
					if (id) onChange(id);
				}
			}}
		>
			{tabs.map((t) => {
				const on = t.id === value;
				return (
					<button
						key={t.id}
						type="button"
						role="tab"
						aria-selected={on}
						tabIndex={on ? 0 : -1}
						data-id={t.id}
						onClick={() => onChange(t.id)}
						className={clsx(
							"press flex h-11 items-center gap-1.5 whitespace-nowrap rounded-pill px-3.5 text-base font-display font-medium",
							on ? "bg-surface text-ink" : "text-ink-3 hover:text-ink",
						)}
					>
						{t.label}
						{t.count !== undefined && (
							<span className={clsx("tabular rounded-pill px-1.5 text-xs", on ? "bg-sunken text-ink-3" : "bg-glass-strong text-ink-4")}>{t.count}</span>
						)}
					</button>
				);
			})}
		</div>
	);
}

// ---- TextField / TextArea --------------------------------------------------

interface IFieldBase {
	label: string;
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
	hint?: ReactNode;
	error?: string;
	icon?: TIconName;
	suffix?: ReactNode;
	counter?: { value: number; max: number };
	/** Visually hide the label (still announced). */
	hideLabel?: boolean;
	className?: string;
}

export interface ITextFieldProps extends IFieldBase, Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "value" | "placeholder" | "className"> {}

export interface ITextAreaProps extends IFieldBase, Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "onChange" | "value" | "placeholder" | "className"> {
	rows?: number;
}

function FieldFrame({
	id,
	label,
	hideLabel,
	hint,
	error,
	counter,
	multiline,
	icon,
	suffix,
	className,
	children,
}: Pick<IFieldBase, "label" | "hideLabel" | "hint" | "error" | "counter" | "icon" | "suffix" | "className"> & { id: string; multiline?: boolean; children: ReactNode }) {
	const over = counter ? counter.value > counter.max : false;
	return (
		<div className={clsx("flex flex-col gap-1.5", className)}>
			<div className={clsx("flex items-baseline justify-between gap-3", hideLabel && !counter && "sr-only")}>
				<label htmlFor={id} className={clsx("text-sm text-ink-3", hideLabel && "sr-only")}>
					{label}
				</label>
				{counter && (
					<span id={`${id}-count`} className={clsx("tabular text-xs", over ? "font-medium text-block-ink" : "text-ink-4")}>
						{counter.value} / {counter.max}
					</span>
				)}
			</div>
			<div
				className={clsx(
					"flex gap-2.5 rounded-sm border bg-surface px-3.5 transition-[border-color,box-shadow] duration-200 focus-within:shadow-[0_0_0_3px_var(--c-focus)]",
					multiline ? "items-start py-2.5" : "h-11 items-center",
					error || over ? "border-block" : "border-line-2 hover:border-line-3",
				)}
			>
				{icon && <Icon name={icon} size={16} className={clsx("text-ink-3", multiline && "mt-1")} />}
				{children}
				{suffix && <span className="shrink-0 text-md text-ink-4">{suffix}</span>}
			</div>
			{(error || hint) && (
				<span id={`${id}-msg`} role={error ? "alert" : undefined} className={clsx("flex items-center gap-1 text-sm", error ? "text-block-ink" : "text-ink-3")}>
					{error && <Icon name="WarningCircle" size={14} />}
					{error || hint}
				</span>
			)}
		</div>
	);
}

function describedBy(id: string, p: Pick<IFieldBase, "error" | "hint" | "counter">): string | undefined {
	const ids = [p.error || p.hint ? `${id}-msg` : null, p.counter ? `${id}-count` : null].filter(Boolean);
	return ids.length ? ids.join(" ") : undefined;
}

const FIELD_INPUT = "min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-ink-5 focus-visible:shadow-none disabled:text-ink-4";

export function TextField({ label, value, onChange, placeholder, hint, error, icon, suffix, counter, hideLabel, className, id: idProp, ...rest }: ITextFieldProps) {
	const auto = useId();
	const id = idProp ?? auto;
	return (
		<FieldFrame id={id} label={label} hideLabel={hideLabel} hint={hint} error={error} counter={counter} icon={icon} suffix={suffix} className={className}>
			<input
				{...rest}
				id={id}
				value={value}
				placeholder={placeholder}
				onChange={(e) => onChange(e.target.value)}
				aria-invalid={!!error || (counter ? counter.value > counter.max : false) || undefined}
				aria-describedby={describedBy(id, { error, hint, counter })}
				className={FIELD_INPUT}
			/>
		</FieldFrame>
	);
}

export function TextArea({ label, value, onChange, placeholder, hint, error, icon, suffix, counter, hideLabel, rows = 4, className, id: idProp, ...rest }: ITextAreaProps) {
	const auto = useId();
	const id = idProp ?? auto;
	return (
		<FieldFrame id={id} label={label} hideLabel={hideLabel} hint={hint} error={error} counter={counter} icon={icon} suffix={suffix} className={className} multiline>
			<textarea
				{...rest}
				id={id}
				rows={rows}
				value={value}
				placeholder={placeholder}
				onChange={(e) => onChange(e.target.value)}
				aria-invalid={!!error || (counter ? counter.value > counter.max : false) || undefined}
				aria-describedby={describedBy(id, { error, hint, counter })}
				className={clsx(FIELD_INPUT, "thin-scrollbar resize-y leading-body")}
			/>
		</FieldFrame>
	);
}

// ---- Select --------------------------------------------------------------

export interface ISelectOption<T extends string | number> {
	value: T;
	label: string;
	hint?: string;
}

export interface ISelectProps<T extends string | number> {
	label?: string;
	value: T | null;
	options: ISelectOption<T>[];
	onChange: (value: T) => void;
	icon?: TIconName;
	placeholder?: string;
	disabled?: boolean;
	align?: "start" | "end";
	className?: string;
}

export function Select<T extends string | number>({ label, value, options, onChange, icon, placeholder = "Choose", disabled, align = "start", className }: ISelectProps<T>) {
	const [open, setOpen] = useState(false);
	const root = useRef<HTMLDivElement>(null);
	const trigger = useRef<HTMLButtonElement>(null);
	const list = useRef<HTMLDivElement>(null);
	const id = useId();
	const close = useCallback(() => setOpen(false), []);
	useDismiss(open, close, root, trigger);
	const current = options.find((o) => o.value === value);

	useEffect(() => {
		if (!open) return;
		const sel = list.current?.querySelector<HTMLElement>("[aria-selected=true]") ?? list.current?.querySelector<HTMLElement>("[role=option]");
		sel?.focus();
	}, [open]);

	const pick = (v: T) => {
		onChange(v);
		setOpen(false);
		trigger.current?.focus();
	};

	return (
		<div ref={root} className={clsx("relative inline-flex flex-col gap-1.5", className)}>
			{label && (
				<span id={`${id}-label`} className="text-sm text-ink-3">
					{label}
				</span>
			)}
			<button
				ref={trigger}
				type="button"
				disabled={disabled}
				aria-haspopup="listbox"
				aria-expanded={open}
				aria-labelledby={label ? `${id}-label ${id}-value` : undefined}
				onClick={() => setOpen((o) => !o)}
				onKeyDown={(e) => {
					if (e.key === "ArrowDown" || e.key === "ArrowUp") {
						e.preventDefault();
						setOpen(true);
					}
				}}
				className="press flex h-11 items-center gap-2 rounded-pill border border-line-2 bg-surface ps-4 pe-3.5 text-base font-display font-medium text-ink hover:border-line-3 disabled:cursor-not-allowed disabled:text-ink-5"
			>
				{icon && <Icon name={icon} size={16} className="text-ink-3" />}
				<span id={`${id}-value`} className={clsx("truncate", !current && "font-sans font-normal text-ink-4")}>
					{current?.label ?? placeholder}
				</span>
				<Icon name="CaretDown" size={13} className={clsx("ms-auto text-ink-3 transition-transform duration-200", open && "rotate-180")} />
			</button>
			{open && (
				<div
					ref={list}
					role="listbox"
					aria-labelledby={label ? `${id}-label` : undefined}
					onKeyDown={(e) => {
						if (moveFocus(e, list.current, "[role=option]")) return;
						if (e.key === "Tab") setOpen(false);
					}}
					className={clsx(
						"thin-scrollbar absolute top-full z-(--c-z-dropdown) mt-2 max-h-72 min-w-full w-max max-w-80 overflow-y-auto rounded-lg border border-line bg-surface p-1.5 shadow-float",
						align === "end" ? "end-0" : "start-0",
					)}
				>
					{options.map((o) => {
						const on = o.value === value;
						return (
							<div
								key={String(o.value)}
								role="option"
								aria-selected={on}
								tabIndex={-1}
								onClick={() => pick(o.value)}
								onKeyDown={(e) => {
									if (e.key === "Enter" || e.key === " ") {
										e.preventDefault();
										pick(o.value);
									}
								}}
								className="flex min-h-10 cursor-pointer items-center gap-2.5 rounded-sm px-3 py-2 text-md outline-none hover:bg-sunken focus-visible:bg-sunken focus-visible:shadow-none"
							>
								<span className="flex min-w-0 flex-1 flex-col">
									<span className="font-display font-medium text-ink">{o.label}</span>
									{o.hint && <span className="text-xs text-ink-3">{o.hint}</span>}
								</span>
								{on && <Icon name="Check" size={14} weight="bold" />}
							</div>
						);
					})}
				</div>
			)}
		</div>
	);
}

// ---- Checkbox ------------------------------------------------------------

export interface ICheckboxProps {
	checked: boolean;
	onChange: (checked: boolean) => void;
	label: ReactNode;
	description?: ReactNode;
	disabled?: boolean;
	className?: string;
}

export function Checkbox({ checked, onChange, label, description, disabled, className }: ICheckboxProps) {
	const id = useId();
	return (
		<label htmlFor={id} className={clsx("group flex min-h-11 cursor-pointer items-start gap-3 py-2", disabled && "cursor-not-allowed opacity-50", className)}>
			<input
				id={id}
				type="checkbox"
				checked={checked}
				disabled={disabled}
				onChange={(e) => onChange(e.target.checked)}
				aria-describedby={description ? `${id}-d` : undefined}
				className="peer sr-only"
			/>
			<span
				aria-hidden
				className={clsx(
					"press mt-px grid size-5 shrink-0 place-items-center rounded-full border-[1.5px] peer-focus-visible:shadow-[0_0_0_3px_var(--c-focus)]",
					checked ? "border-ink bg-ink text-on-ink" : "border-line-3 bg-surface text-transparent group-hover:border-ink-4",
				)}
			>
				<Icon name="Check" size={11} weight="bold" />
			</span>
			<span className="flex min-w-0 flex-col gap-0.5">
				<span className="text-base text-ink">{label}</span>
				{description && (
					<span id={`${id}-d`} className="text-sm text-ink-3">
						{description}
					</span>
				)}
			</span>
		</label>
	);
}

// ---- Toggle --------------------------------------------------------------

export interface IToggleProps {
	checked: boolean;
	onChange: (checked: boolean) => void;
	label: string;
	caption?: ReactNode;
	disabled?: boolean;
	/** Visually hide the label (still announced). */
	hideLabel?: boolean;
	className?: string;
}

export function Toggle({ checked, onChange, label, caption, disabled, hideLabel, className }: IToggleProps) {
	const id = useId();
	return (
		<div className={clsx("flex min-h-11 items-center gap-3", className)}>
			<button
				id={id}
				type="button"
				role="switch"
				aria-checked={checked}
				aria-describedby={caption ? `${id}-c` : undefined}
				aria-label={hideLabel ? label : undefined}
				disabled={disabled}
				onClick={() => onChange(!checked)}
				className={clsx(
					"relative h-5 w-[34px] shrink-0 rounded-pill transition-colors duration-200 after:absolute after:-inset-3 after:content-[''] disabled:cursor-not-allowed disabled:opacity-40",
					checked ? "bg-ink" : "bg-line-3",
				)}
			>
				<span
					aria-hidden
					className={clsx(
						"absolute top-0.5 size-4 rounded-full bg-surface shadow-card transition-[inset-inline-start] duration-200 ease-spring",
						checked ? "start-4" : "start-0.5",
					)}
				/>
			</button>
			{!hideLabel && (
				<div className="flex min-w-0 flex-col gap-0.5">
					<label htmlFor={id} className="cursor-pointer font-display text-base font-medium text-ink">
						{label}
					</label>
					{caption && (
						<span id={`${id}-c`} className="text-sm text-ink-3">
							{caption}
						</span>
					)}
				</div>
			)}
		</div>
	);
}

// ---- Chip ----------------------------------------------------------------

export interface IChipProps {
	tone?: TTone;
	icon?: TIconName;
	size?: "sm" | "md";
	onRemove?: () => void;
	/** Accessible name for the remove button; defaults to "Remove". */
	removeLabel?: string;
	children: ReactNode;
	className?: string;
}

export function Chip({ tone = "neutral", icon, size = "md", onRemove, removeLabel = "Remove", children, className }: IChipProps) {
	return (
		<span
			className={clsx(
				"inline-flex shrink-0 items-center whitespace-nowrap rounded-pill font-display font-medium",
				size === "sm" ? "h-[22px] gap-1 px-2 text-xs" : "h-7 gap-1.5 px-2.5 text-sm",
				onRemove && "pe-1",
				TONE_CHIP[tone],
				className,
			)}
		>
			{icon && <Icon name={icon} size={size === "sm" ? 11 : 13} />}
			{children}
			{onRemove && (
				<button type="button" onClick={onRemove} aria-label={removeLabel} className={clsx("press grid size-5 place-items-center rounded-full hover:bg-ink/10", HIT)}>
					<Icon name="X" size={11} weight="bold" />
				</button>
			)}
		</span>
	);
}

// ---- Dot -----------------------------------------------------------------

export interface IDotProps {
	tone: TTone;
	pulse?: boolean;
	ring?: boolean;
	/** Announced text; without it the dot is decorative. */
	label?: string;
	className?: string;
}

export function Dot({ tone, pulse, ring, label, className }: IDotProps) {
	return (
		<span
			role={label ? "img" : undefined}
			aria-label={label}
			aria-hidden={label ? undefined : true}
			className={clsx("inline-block size-2 shrink-0 rounded-full", TONE_FILL[tone], (ring || pulse) && TONE_RING[tone], pulse && tone === "agent" && "c-pulse", className)}
		/>
	);
}

// ---- Kbd -----------------------------------------------------------------

export interface IKbdProps {
	children: ReactNode;
	className?: string;
}

export function Kbd({ children, className }: IKbdProps) {
	return <kbd className={clsx("inline-flex h-5 items-center rounded-xs bg-sunken px-[7px] font-display text-xs font-medium text-ink-3", className)}>{children}</kbd>;
}

// ---- Menu ----------------------------------------------------------------

export interface IMenuItem {
	id: string;
	label: ReactNode;
	icon?: TIconName;
	tone?: TTone;
	onSelect: () => void;
	disabled?: boolean;
}

export interface IMenuProps {
	/** A single element (e.g. a Button); it receives the toggle + aria props. Non-elements are wrapped in a button. */
	trigger: ReactNode;
	items: IMenuItem[];
	align?: "start" | "end";
	/** Open below (default) or above the trigger — use "top" for triggers pinned to the bottom of the viewport. */
	side?: "bottom" | "top";
	/** Accessible name for the wrapper button when `trigger` is not an element. */
	label?: string;
	className?: string;
}

type TTriggerProps = {
	onClick?: (e: MouseEvent<HTMLElement>) => void;
	onKeyDown?: (e: KeyboardEvent<HTMLElement>) => void;
	"aria-haspopup"?: "menu";
	"aria-expanded"?: boolean;
	"aria-controls"?: string;
};

export function Menu({ trigger, items, align = "start", side = "bottom", label, className }: IMenuProps) {
	const [open, setOpen] = useState(false);
	const root = useRef<HTMLDivElement>(null);
	const list = useRef<HTMLDivElement>(null);
	const triggerHolder = useRef<HTMLElement | null>(null);
	const id = useId();
	const close = useCallback(() => setOpen(false), []);
	useDismiss(open, close, root, triggerHolder);

	useEffect(() => {
		if (open) list.current?.querySelector<HTMLElement>("[role=menuitem]:not([aria-disabled=true])")?.focus();
	}, [open]);

	const toggleProps: TTriggerProps = {
		"aria-haspopup": "menu",
		"aria-expanded": open,
		"aria-controls": open ? id : undefined,
	};
	const onTriggerClick = (e: MouseEvent<HTMLElement>) => {
		triggerHolder.current = e.currentTarget;
		setOpen((o) => !o);
	};
	const onTriggerKey = (e: KeyboardEvent<HTMLElement>) => {
		if (e.key === "ArrowDown") {
			e.preventDefault();
			triggerHolder.current = e.currentTarget;
			setOpen(true);
		}
	};

	let node: ReactNode;
	const only = Children.count(trigger) === 1 && isValidElement(trigger) ? (trigger as ReactElement<TTriggerProps>) : null;
	if (only) {
		const own = only.props;
		node = cloneElement(only, {
			...toggleProps,
			onClick: (e: MouseEvent<HTMLElement>) => {
				own.onClick?.(e);
				onTriggerClick(e);
			},
			onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
				own.onKeyDown?.(e);
				onTriggerKey(e);
			},
		});
	} else {
		node = (
			<button type="button" aria-label={label} {...toggleProps} onClick={onTriggerClick} onKeyDown={onTriggerKey} className="press inline-flex min-h-11 items-center">
				{trigger}
			</button>
		);
	}

	const select = (it: IMenuItem) => {
		if (it.disabled) return;
		setOpen(false);
		triggerHolder.current?.focus();
		it.onSelect();
	};

	return (
		<div ref={root} className={clsx("relative inline-flex", className)}>
			{node}
			{open && (
				<div
					ref={list}
					id={id}
					role="menu"
					onKeyDown={(e) => {
						if (moveFocus(e, list.current, "[role=menuitem]:not([aria-disabled=true])")) return;
						if (e.key === "Tab") setOpen(false);
					}}
					className={clsx(
						side === "top" ? "bottom-full mb-2" : "top-full mt-2",
						"thin-scrollbar absolute z-(--c-z-dropdown) max-h-80 w-max min-w-52 max-w-80 overflow-y-auto rounded-lg border border-line bg-surface p-1.5 shadow-float",
						align === "end" ? "end-0" : "start-0",
					)}
				>
					{items.map((it) => (
						<div
							key={it.id}
							role="menuitem"
							tabIndex={-1}
							aria-disabled={it.disabled || undefined}
							onClick={() => select(it)}
							onKeyDown={(e) => {
								if (e.key === "Enter" || e.key === " ") {
									e.preventDefault();
									select(it);
								}
							}}
							className={clsx(
								"flex min-h-10 items-center gap-2.5 rounded-sm px-3 py-2 font-display text-md font-medium outline-none focus-visible:shadow-none",
								it.disabled ? "cursor-not-allowed text-ink-5" : clsx("cursor-pointer hover:bg-sunken focus-visible:bg-sunken", TONE_TEXT[it.tone ?? "neutral"]),
							)}
						>
							{it.icon && <Icon name={it.icon} size={16} />}
							<span className="min-w-0 flex-1 truncate">{it.label}</span>
						</div>
					))}
				</div>
			)}
		</div>
	);
}

// ---- Tooltip -------------------------------------------------------------

export interface ITooltipProps {
	label: ReactNode;
	children: ReactNode;
	/** Placement; the icon rail uses "end". */
	side?: "top" | "bottom" | "end";
	className?: string;
}

const TIP_SIDE = {
	top: "bottom-full inset-x-0 mx-auto mb-2",
	bottom: "top-full inset-x-0 mx-auto mt-2",
	end: "start-full top-1/2 -translate-y-1/2 ms-2.5",
};

export function Tooltip({ label, children, side = "top", className }: ITooltipProps) {
	const [open, setOpen] = useState(false);
	const id = useId();
	useEffect(() => {
		if (!open) return;
		const onKey = (e: globalThis.KeyboardEvent) => e.key === "Escape" && setOpen(false);
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, [open]);
	const child =
		isValidElement(children) && Children.count(children) === 1
			? cloneElement(children as ReactElement<{ "aria-describedby"?: string }>, { "aria-describedby": open ? id : undefined })
			: children;
	return (
		<span
			className={clsx("relative inline-flex", className)}
			onPointerEnter={() => setOpen(true)}
			onPointerLeave={() => setOpen(false)}
			onFocus={() => setOpen(true)}
			onBlur={() => setOpen(false)}
		>
			{child}
			<span
				id={id}
				role="tooltip"
				className={clsx(
					"pointer-events-none absolute z-(--c-z-dropdown) w-max max-w-64 rounded-sm bg-ink px-2.5 py-1.5 text-start font-display text-sm font-medium text-on-ink shadow-float transition-opacity duration-200",
					TIP_SIDE[side],
					open ? "opacity-100" : "invisible opacity-0",
				)}
			>
				{label}
			</span>
		</span>
	);
}

// ---- Composer ------------------------------------------------------------

export interface IComposerProps {
	placeholder: string;
	value: string;
	onChange: (value: string) => void;
	onSubmit: (value: string) => void;
	suggestions?: string[];
	onSuggestion?: (suggestion: string) => void;
	busy?: boolean;
	/** Dictation handler; the mic is shown disabled without it. */
	onMic?: () => void;
	/** "white" on glass (visual aid); "sunken" inside a white card (ref 02 editor). */
	surface?: "white" | "sunken";
	className?: string;
}

export function Composer({ placeholder, value, onChange, onSubmit, suggestions, onSuggestion, busy, onMic, surface = "white", className }: IComposerProps) {
	const canSend = value.trim().length > 0 && !busy;
	const submit = (e: FormEvent) => {
		e.preventDefault();
		if (canSend) onSubmit(value.trim());
	};
	const chip = surface === "white" ? "bg-surface hover:bg-sunken" : "bg-sunken hover:bg-line-2";
	return (
		<div className={clsx("flex flex-col gap-2.5", className)}>
			{suggestions && suggestions.length > 0 && (
				<div className="no-scrollbar flex gap-1.5 overflow-x-auto" role="group" aria-label="Suggestions">
					{suggestions.map((s) => (
						<button
							key={s}
							type="button"
							disabled={busy}
							onClick={() => (onSuggestion ? onSuggestion(s) : onChange(s))}
							className={clsx("press h-[30px] shrink-0 whitespace-nowrap rounded-pill px-3 font-display text-sm font-medium text-ink disabled:opacity-40", HIT, chip)}
						>
							{s}
						</button>
					))}
				</div>
			)}
			<form
				onSubmit={submit}
				aria-busy={busy || undefined}
				className={clsx(
					"flex h-[52px] items-center gap-2.5 rounded-2xl ps-[18px] pe-2 transition-shadow duration-200 focus-within:shadow-[0_0_0_3px_var(--c-focus)]",
					surface === "white" ? "bg-surface" : "bg-sunken-2",
				)}
			>
				<Icon name="Sparkle" size={17} className="text-agent" />
				<input
					value={value}
					onChange={(e) => onChange(e.target.value)}
					placeholder={placeholder}
					aria-label={placeholder}
					disabled={busy}
					enterKeyHint="send"
					className="min-w-0 flex-1 bg-transparent text-md text-ink outline-none placeholder:text-ink-5 focus-visible:shadow-none disabled:text-ink-4"
				/>
				<button
					type="button"
					onClick={onMic}
					disabled={!onMic || busy}
					aria-label="Dictate"
					className={clsx("press grid size-9 shrink-0 place-items-center rounded-full text-ink-3 hover:bg-sunken hover:text-ink disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-ink-3", HIT)}
				>
					<Icon name="Microphone" size={18} />
				</button>
				<button
					type="submit"
					disabled={!canSend}
					aria-label={busy ? "Working" : "Send"}
					className={clsx("press grid size-[38px] shrink-0 place-items-center rounded-full bg-ink text-on-ink hover:bg-ink-hover disabled:cursor-not-allowed", HIT, !canSend && !busy && "opacity-40")}
				>
					{busy ? <Spinner size={16} /> : <Icon name="ArrowUp" size={16} weight="bold" />}
				</button>
			</form>
		</div>
	);
}

// ---- FileDrop ------------------------------------------------------------

export interface IFileDropProps {
	/** Input accept string, e.g. ".html,.zip". */
	accept: string;
	onFile: (file: File) => void;
	title: string;
	hint: ReactNode;
	disabled?: boolean;
	className?: string;
}

export function FileDrop({ accept, onFile, title, hint, disabled, className }: IFileDropProps) {
	const [over, setOver] = useState(false);
	const input = useRef<HTMLInputElement>(null);
	const id = useId();
	const onDrop = (e: DragEvent) => {
		e.preventDefault();
		setOver(false);
		if (disabled) return;
		const f = e.dataTransfer.files?.[0];
		if (f) onFile(f);
	};
	return (
		<div
			onDragOver={(e) => {
				e.preventDefault();
				if (!disabled) setOver(true);
			}}
			onDragLeave={() => setOver(false)}
			onDrop={onDrop}
			className={clsx(
				"flex min-h-44 flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-6 text-center transition-colors duration-200",
				over ? "border-agent bg-agent-soft" : "border-line-3 bg-surface",
				disabled && "opacity-50",
				className,
			)}
		>
			<span aria-hidden className={clsx("grid size-11 place-items-center rounded-full", over ? "bg-surface text-agent" : "bg-sunken text-ink")}>
				<Icon name="UploadSimple" size={20} />
			</span>
			<div className="flex flex-col gap-1">
				<span className="font-display text-lg font-medium text-ink">{title}</span>
				<span id={`${id}-hint`} className="text-md text-ink-3">
					{hint}
				</span>
			</div>
			<input
				ref={input}
				id={id}
				type="file"
				accept={accept}
				disabled={disabled}
				className="sr-only"
				tabIndex={-1}
				onChange={(e) => {
					const f = e.target.files?.[0];
					if (f) onFile(f);
					e.target.value = "";
				}}
			/>
			<Button variant="secondary" size="sm" icon="FileText" disabled={disabled} aria-describedby={`${id}-hint`} onClick={() => input.current?.click()}>
				Choose file
			</Button>
		</div>
	);
}

// ---- Stepper -------------------------------------------------------------

export interface IStepperProps {
	steps: { id: string; label: string }[];
	/** Zero-based index of the current step. */
	current: number;
	className?: string;
}

export function Stepper({ steps, current, className }: IStepperProps) {
	return (
		<ol className={clsx("flex flex-wrap items-center gap-x-2 gap-y-1", className)} aria-label="Progress">
			{steps.map((s, i) => {
				const done = i < current;
				const now = i === current;
				return (
					<li key={s.id} aria-current={now ? "step" : undefined} className="flex items-center gap-2">
						{i > 0 && <Icon name="CaretRight" size={12} className="text-ink-5" />}
						<span
							className={clsx(
								"tabular grid size-6 place-items-center rounded-full font-display text-xs font-medium",
								done ? "bg-pass-soft text-pass-ink" : now ? "bg-ink text-on-ink" : "bg-sunken text-ink-4",
							)}
						>
							{done ? <Icon name="Check" size={12} weight="bold" label="Done" /> : i + 1}
						</span>
						<span className={clsx("font-display text-md font-medium", now ? "text-ink" : done ? "text-ink-2" : "text-ink-4")}>{s.label}</span>
					</li>
				);
			})}
		</ol>
	);
}

// ---- LockedAction --------------------------------------------------------

export interface ILockedActionProps {
	label: string;
	icon?: TIconName;
	/** Why the action is locked; count drives "· N hard blocks". */
	reasons: string[];
	onClick?: () => void;
	unlocked?: boolean;
	loading?: boolean;
	size?: "sm" | "md";
	/** Inline summary after the label; defaults to "N hard blocks". Use when reasons aren't hard blocks ("Confirm all three"). */
	summary?: string;
	className?: string;
}

export function LockedAction({ label, icon, reasons, onClick, unlocked, loading, size = "md", summary, className }: ILockedActionProps) {
	const [open, setOpen] = useState(false);
	const root = useRef<HTMLDivElement>(null);
	const btn = useRef<HTMLButtonElement>(null);
	const id = useId();
	const close = useCallback(() => setOpen(false), []);
	useDismiss(open, close, root, btn);

	if (unlocked) {
		return (
			<Button variant="primary" size={size} icon={icon} loading={loading} onClick={onClick} className={className}>
				{label}
			</Button>
		);
	}
	const n = reasons.length;
	const count = summary ?? `${n} hard block${n === 1 ? "" : "s"}`;
	return (
		<div ref={root} className={clsx("relative inline-flex", className)} onPointerEnter={() => setOpen(true)} onPointerLeave={() => setOpen(false)}>
			<button
				ref={btn}
				type="button"
				aria-disabled="true"
				aria-describedby={`${id}-why`}
				aria-expanded={open}
				onClick={() => setOpen((o) => !o)}
				className={clsx(
					"press inline-flex cursor-not-allowed items-center gap-2 whitespace-nowrap rounded-pill bg-ink font-display font-medium text-on-ink",
					size === "md" ? "h-11 ps-4 pe-5 text-base" : `h-8 ps-2.5 pe-3 text-sm ${HIT}`,
				)}
			>
				<Icon name="LockSimple" size={size === "md" ? 16 : 14} />
				{label}
				{(n > 0 || summary) && <span className="font-sans text-sm font-normal text-on-ink/60">· {count}</span>}
			</button>
			<div
				id={`${id}-why`}
				role="tooltip"
				className={clsx(
					"absolute end-0 top-full z-(--c-z-dropdown) mt-2 w-max min-w-56 max-w-80 rounded-lg bg-ink p-3 text-on-ink shadow-float transition-opacity duration-200",
					open ? "opacity-100" : "invisible opacity-0",
				)}
			>
				<span className="mb-1.5 block font-display text-sm font-medium">{n > 0 ? `Locked · ${count}` : "Locked"}</span>
				<ul className="flex flex-col gap-1">
					{reasons.map((r) => (
						<li key={r} className="flex items-start gap-2 text-sm text-on-ink/80">
							<Icon name="XCircle" size={14} className="mt-0.5 text-block" />
							{r}
						</li>
					))}
				</ul>
			</div>
		</div>
	);
}
