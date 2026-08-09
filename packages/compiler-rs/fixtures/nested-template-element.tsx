export default function NestedTemplateElement() {
  return (
    <div class="host">
      <template id="row">
        <li class="row">
          <span>cell</span>
        </li>
      </template>
      <ul />
    </div>
  )
}
