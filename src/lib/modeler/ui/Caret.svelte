<script lang="ts">
	// The one caret, so every disclosure and menu matches: points down when open (and on menu
	// buttons, which open below), right when closed. Takes the color of the text around it.
	let { open = true }: { open?: boolean } = $props();
</script>

<span class="caret" class:caret--closed={!open} aria-hidden="true">▶</span>

<style>
	.caret {
		display: inline-block;
		flex-shrink: 0;
		font-size: 0.5rem;
		line-height: 1;
		transform: rotate(90deg);
		transition: transform 0.15s ease;
	}
	.caret--closed { transform: none; }
</style>
