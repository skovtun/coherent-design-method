<div @class([
    'base-card',
    'border border-mantis-400' => $isActive,
    'opacity-50' => $disabled,
])>
    <span @class([
        'text-mantis-400' => $success,
        'text-red font-bold' => $error,
    ])>
        Status (matches "(thing)" with paren in string)
    </span>
</div>
