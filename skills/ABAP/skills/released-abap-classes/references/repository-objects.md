# Reading and generating repository objects

One topic from the *Released ABAP Classes* cheat sheet; the rest are listed in this skill's SKILL.md.
A class appearing here is not proof it exists on your system - release state is per system and per
release. `readAbapObject` returning the object is the proof.

## Contents

- ABAP Repository Object Information
- Generating ABAP Repository Objects

---

## ABAP Repository Object Information 

> [!IMPORTANT] 
> - Note that the _XCO CP Edition_ (many of the released XCO APIs include _CP_ in the class name) features released classes specifically designed for cloud usage, particularly in the SAP BTP ABAP Environment. 
> - While these classes can theoretically be used in other system environments, there is no guarantee of API functionality. This is especially true for the classes in this section that provide information about repository objects. Only SAP- and customer-released repository objects are supported. Find more information [here](https://help.sap.com/docs/btp/sap-business-technology-platform/abap-repository).
> - The following two example snippets use the XCO APIs `xco_cp_abap_repository` and `xco_abap_repository` (without _CP_, applicable in Standard ABAP). The assumption is that you have access to a system that supports classic ABAP, the `xco_abap_repository` API is available, and you have imported the ABAP cheat sheet repository (or you might use another custom database table). You can use the following to visualize the aforementioned disclaimer. In a class flagged for ABAP for Cloud Development, the following snippet is usable, in principle. However, you may find that it does not verify the existence of the demo database table (as it is not released). If you have imported the ABAP cheat sheet repository into an SAP BTP ABAP Environment, the snippet will return true there.
>   ```
>   "xco_cp_abap_repository
>   DATA(tabl) = xco_cp_abap_repository=>object->tabl->database_table->for( 'ZDEMO_ABAP_CARR' ).
>   DATA(tabl_exists) = tabl->exists( ).
>   ```
>   Using `xco_abap_repository` in a class flagged for use with Standard ABAP, the snippet returns true.
>   ```  
>   "xco_abap_repository
>   DATA(tabl_2) = xco_abap_repository=>object->tabl->database_table->for( 'ZDEMO_ABAP_CARR' ).
>   DATA(tabl_2_exists) = tabl_2->exists( ).    
>   ```

<table>
<tr>
<td> Class </td> <td> Details/Code Snippet </td>
</tr>
<tr>
<td> <code>XCO_CP_ABAP</code><br><code>XCO_CP_ABAP_REPOSITORY</code><br><code>XCO_CP_ABAP_DICTIONARY</code> </td>
<td>

<ul>
<li>Provides access to abstractions for ABAP Dictionary objects such as database tables, data elements, types and more.</li>
<li>For more detailed examples, refer to the <a href="https://help.sap.com/docs/btp/sap-business-technology-platform/overview-of-xco-modules">SAP Help Portal</a>. See also the executable example of the <a href="19_ABAP_for_Cloud_Development.md">ABAP for Cloud Development</a> cheat sheet.</li>
<li>The code snippet contains a small selection and only hints at the many ways to retrieve different pieces of information that the classes provide.</li>
<li>The snippet does not only include the <code>XCO_CP_ABAP_REPOSITORY</code> class but also others such as <code>XCO_CP_ABAP</code>, <code>XCO_CP_ABAP_SQL</code>, and <code>XCO_CP_CDS</code>. More XCO classes are available in that context.</li>
</ul>
<br>

``` abap
"Getting all accessible repository objects in the system
"To further process the returned values, you can loop over them.
DATA(all_obj) = xco_cp_abap_repository=>objects->all->in( xco_cp_abap=>repository )->get( ).

"Gettig all repository objects of a specific kind in the system
"Check the objects after 'objects->'.
DATA(all_tables) = xco_cp_abap_repository=>objects->tabl->all->in( xco_cp_abap=>repository )->get( ).
DATA(all_bdefs) = xco_cp_abap_repository=>objects->bdef->all->in( xco_cp_abap=>repository )->get( ).
DATA(all_classes) = xco_cp_abap_repository=>objects->clas->all->in( xco_cp_abap=>repository )->get( ).
DATA(all_interfaces) = xco_cp_abap_repository=>objects->intf->all->in( xco_cp_abap=>repository )->get( ).

"Refining the search by applying a filter
"Creating a filter and adding a search pattern
DATA(filter1) = xco_cp_abap_repository=>object_name->get_filter(
  xco_cp_abap_sql=>constraint->contains_pattern( 'ZDEMO_ABAP_RAP_R%' ) ).

"Getting all BDEFs in the system having a specific pattern
DATA(bdefs_in_package) = xco_cp_abap_repository=>objects->bdef->where( VALUE #( ( filter1 )
    ) )->in( xco_cp_abap=>repository )->get( ).

"Getting all accessible interfaces with a particular name pattern in the entire system
DATA(filter2) = xco_cp_abap_repository=>object_name->get_filter(
  xco_cp_abap_sql=>constraint->contains_pattern( 'IF_ABAP_BEHV%' ) ).
DATA(all_intfs) = xco_cp_abap_repository=>objects->intf->where( VALUE #( ( filter2 )
  ) )->in( xco_cp_abap=>repository )->get( ).

"Getting all classes in the system that correspond to a specific name pattern and
"that are contained in a specific software component
"Creating filters
DATA(filter3) = xco_cp_system=>software_component->get_filter( xco_cp_abap_sql=>constraint->equal( 'SAP_BASIS' ) ).
DATA(filter4) = xco_cp_abap_repository=>object_name->get_filter( xco_cp_abap_sql=>constraint->contains_pattern( '%CL_ABAP_RAND%' ) ).
DATA(filtered_classes) = xco_cp_abap_repository=>objects->clas->where( VALUE #( ( filter3 ) ( filter4 )
  ) )->in( xco_cp_abap=>repository )->get( ).

"Checking if a repository object with a specific name exists in the system
DATA(type_names) = VALUE string_table( ( `ZDEMO_ABAP_FLI` ) ( `ZDEMO_ABAP_FLSCH_VE` ) ).
LOOP AT type_names INTO DATA(type_name).
  DATA(filter5) = xco_cp_abap_repository=>object_name->get_filter( xco_cp_abap_sql=>constraint->equal( type_name ) ).
  "A table is returned containing found repository objects of the specified name
  DATA(repo_objects) = xco_cp_abap_repository=>objects->where( VALUE #( ( filter5 ) ) )->in( xco_cp_abap=>repository )->get( ).

  "Some examples for further processing the returned objects
  "You can explore more options, e.g., by adding the object component selector (->)
  "to the final parenthesis and checking the suggestions by ADT.
  LOOP AT repo_objects INTO DATA(obj).
    "Retrieving the four-character value of the object type
    DATA(val) = obj->type->value.
    "Retrieving the package name of the repository object
    DATA(package) = obj->get_package( )->name.

    ...
  ENDLOOP.
ENDLOOP.

*&---------------------------------------------------------------------*
*& Database table
*&---------------------------------------------------------------------*

DATA(tabl) = xco_cp_abap_repository=>object->tabl->database_table->for( 'ZDEMO_ABAP_CARR' ).
IF tabl->exists( ).
  DATA(dbtab_name) = tabl->name.

  "Database table field information
  DATA(dbtab_fields) = tabl->fields->all->get( ).
  "Iterating across all table fields and retrieving information
  LOOP AT dbtab_fields INTO DATA(field).
    DATA(field_name) = field->name.
    DATA(field_content) = field->content( )->get( ).
    "Accessing (selected) information via the resulting structure of the get method
    DATA(field_short_desc_1) = field_content-short_description.
    DATA(field_key_indicator_1) = field_content-key_indicator.
    DATA(field_type) = field_content-type.
    "Accessing (selected) information via dedicated methods
    DATA(field_curr_quan) = field->content( )->get_currency_quantity( ).
    DATA(field_geodata) = field->content( )->get_geodata( ).
    DATA(field_key_indidator_2) = field->content( )->get_key_indicator( ).
    DATA(field_lang_indicator) = field->content( )->get_language_indicator( ).
    DATA(field_not_null) = field->content( )->get_not_null( ).
    DATA(field_short_desc_2) = field->content( )->get_short_description( ).
    "Checking on underlying built-in type
    DATA(field_is_built_in_type) = field->content( )->get_type( )->is_built_in_type( ).
    IF field_is_built_in_type = abap_true.
      DATA(field_built_in_type) = field->content( )->get_type( )->get_built_in_type( ).
      DATA(field_built_in_type_dec) = field->content( )->get_type( )->get_built_in_type( )->decimals.
      DATA(field_built_in_type_len) = field->content( )->get_type( )->get_built_in_type( )->length.
      DATA(field_built_in_type_t) = field->content( )->get_type( )->get_built_in_type( )->type.
      DATA(field_built_in_type_tdo) = field->content( )->get_type( )->get_built_in_type( )->abap_type->get_type_descriptor( ).
      DATA(field_built_in_type_abs_name) = field->content( )->get_type( )->get_built_in_type( )->abap_type->get_type_descriptor( )->absolute_name.
    ENDIF.
    "Checking on underlying data element
    DATA(field_is_data_element) = field->content( )->get_type( )->is_data_element( ).
    IF field_is_data_element = abap_true.
      DATA(field_data_element) = field->content( )->get_type( )->get_data_element( ).
      DATA(field_data_element_name) = field->content( )->get_type( )->get_data_element( )->name.
      DATA(field_data_element_content) = field->content( )->get_type( )->get_data_element( )->content( )->get( ).
      DATA(field_data_element_type) = field->content( )->get_type( )->get_data_element( )->content( )->get_data_type( ).
      DATA(field_data_element_short_desc) = field->content( )->get_type( )->get_data_element( )->content( )->get_short_description( ).
      DATA(field_data_element_short_label) = field->content( )->get_type( )->get_data_element( )->content( )->get_short_field_label( ).
      DATA(field_data_element_med_label) = field->content( )->get_type( )->get_data_element( )->content( )->get_medium_field_label( ).
      DATA(field_data_element_long_label) = field->content( )->get_type( )->get_data_element( )->content( )->get_long_field_label( ).
      DATA(field_data_element_has_builtin) = field->content( )->get_type( )->get_data_element( )->content( )->has_underlying_built_in_type( ).
      IF field_data_element_has_builtin = abap_true.
        DATA(field_data_element_built_in) = field->content( )->get_type( )->get_data_element( )->content( )->get_underlying_built_in_type( ).
        ... "See methods above
      ENDIF.
    ENDIF.
  ENDLOOP.

  "Accessing table field information with a known field name
  DATA(concrete_field) = tabl->field( 'CARRID' ).
  IF concrete_field->exists( ).
    DATA(concrete_field_content) = concrete_field->content( )->get( ).
    ... "See methods above
  ENDIF.

  "Accessing all table fields using the 'all' method
  DATA(dbtab_fields_all_names) = tabl->fields->all->get_names( ).
  DATA(dbtab_fields_all) = tabl->fields->all->get( ).
  LOOP AT dbtab_fields_all INTO DATA(fld).
    DATA(fld_name) = fld->name.
    DATA(fld_content) = fld->content( )->get( ).
    ... "See methods above
  ENDLOOP.
  DATA(dbtab_fields_all_built_in_t) = tabl->fields->all->content( )->get_underlying_built_in_types( ).

  "Appended field information
  DATA(dbtab_fields_appended_names) = tabl->fields->appended->get_names( ).
  DATA(dbtab_fields_appended_all) = tabl->fields->appended->get( ).
  LOOP AT dbtab_fields_appended_all INTO DATA(app).
    DATA(app_name) = app->name.
    DATA(app_content) = app->content( )->get( ).
    ... "See methods above
  ENDLOOP.
  DATA(dbtab_fields_appended_builtin) = tabl->fields->appended->content( )->get_underlying_built_in_types( ).

  "Key information
  DATA(dbtab_fields_key_names) = tabl->fields->key->get_names( ).
  DATA(dbtab_fields_key_all) = tabl->fields->key->get( ).
  LOOP AT dbtab_fields_key_all INTO DATA(key).
    DATA(key_name) = key->name.
    DATA(key_content) = key->content( )->get( ).
    ... "See methods above
  ENDLOOP.
  DATA(dbtab_fields_key_built_in_t) = tabl->fields->key->content( )->get_underlying_built_in_types( ).

  "Included fields information
  DATA(dbtab_fields_included_names) = tabl->fields->included->get_names( ).
  DATA(dbtab_fields_included_all) = tabl->fields->included->get( ).
  LOOP AT dbtab_fields_included_all INTO DATA(incl).
    DATA(incl_name) = incl->name.
    DATA(incl_content) = incl->content( )->get( ).
    ... "See methods above
  ENDLOOP.
  DATA(dbtab_fields_included_built_in) = tabl->fields->included->content( )->get_underlying_built_in_types( ).

  "Accessing table header content
  DATA(dbtab_content) = tabl->content( )->get( ).
  "Access (selected) information via the resulting structure of the get method
  DATA(dbtab_enh_category_1) = dbtab_content-enhancement_category->value.
  DATA(dbtab_short_desc_1) = dbtab_content-short_description.
  "Access (selected) information via dedicated methods
  DATA(dbtab_data_maint) = tabl->content( )->get_data_maintenance( )->value.
  DATA(dbtab_delivery_class) = tabl->content( )->get_delivery_class( )->value.
  DATA(dbtab_enh_category_2) = tabl->content( )->get_enhancement_category( )->value.
  DATA(dbtab_field_suffix) = tabl->content( )->get_field_suffix( ).
  DATA(dbtab_includes) = tabl->content( )->get_includes( ).
  DATA(dbtab_inv_hash_ind) = tabl->content( )->get_inverted_hash_indicator( ).
  DATA(dbtab_raw_fields) = tabl->content( )->get_raw_fields( ).
  DATA(dbtab_short_desc_2) = tabl->content( )->get_short_description( ).
  DATA(dbtab_tech_settings) = tabl->content( )->get_technical_settings( ).
  DATA(dbtab_read_state) = tabl->content( )->read_state->value.

  DATA(dbtab_release_state) = tabl->get_api_state( )->get_release_state( )->value.
  DATA(dbtab_visibilities) = tabl->get_api_state( )->get_visibilities( ).

  "Retrieving further information via interfaces
  DATA(dbtab_namespace) = tabl->if_xco_ar_object~get_namespace( ).
  DATA(dbtab_orig_lang) = tabl->if_xco_ar_object~get_original_language( )->value.
  DATA(dbtab_package) = tabl->if_xco_ar_object~get_package( )->name.
  DATA(dbtab_cts_obj) = tabl->if_xco_cts_changeable~get_object( )->name.
  DATA(dbtab_cts_obj_is_locked) = tabl->if_xco_cts_changeable~get_object( )->is_locked( ).
  IF dbtab_cts_obj_is_locked = abap_true.
    DATA(dbtab_tr) = tabl->if_xco_cts_changeable~get_object( )->get_lock( )->get_transport( ).
  ENDIF.
  DATA(dbtab_obj_type) = tabl->if_xco_cts_changeable~get_object( )->type.
  DATA(dbtab_cts_obj_prog_id) = tabl->if_xco_cts_changeable~get_object( )->program_id->value.

ELSE.
  "Database table does not exist
ENDIF.

*&---------------------------------------------------------------------*
*& Data element
*&---------------------------------------------------------------------*

DATA(dtel) = xco_cp_abap_dictionary=>data_element( 'ABAP_BOOLEAN' ).
IF dtel->exists( ).
  DATA(dtel_name) = dtel->name.
  DATA(dtel_syntax_check_msg) = dtel->check_syntax( )->messages.
  "Handle for header content of data element
  DATA(dtel_content) = dtel->content( ).
  DATA(dtel_content_get) = dtel_content->get( ).
  "Accessing (selected) information via the resulting structure of the get method
  DATA(dtel_short_desc_1) = dtel_content_get-short_description.
  DATA(dtel_long_label_1) = dtel_content_get-long_field_label.
  "Accessing (selected) information via dedicated methods
  DATA(dtel_heading_label) = dtel_content->get_heading_field_label( ).
  DATA(dtel_short_label) = dtel_content->get_short_field_label( ).
  DATA(dtel_long_label_2) = dtel_content->get_long_field_label( ).
  DATA(dtel_medium_label) = dtel_content->get_medium_field_label( ).
  DATA(dtel_description) = dtel_content->get_short_description( ).
  "Type information
  "Type checks
  DATA(dtel_type_is_builtin) = dtel_content->get_data_type( )->is_built_in_type( ).
  DATA(dtel_type_is_builtin_ref) = dtel_content->get_data_type( )->is_built_in_type_reference( ).
  DATA(dtel_type_is_class) = dtel_content->get_data_type( )->is_class( ).
  DATA(dtel_type_is_dtype_ref) = dtel_content->get_data_type( )->is_data_type_reference( ).
  DATA(dtel_type_is_intf) = dtel_content->get_data_type( )->is_interface( ).
  DATA(dtel_type_is_domain) = dtel_content->get_data_type( )->is_domain( ).

  DATA(dtel_has_built_in_type) = dtel_content->has_underlying_built_in_type( ).
  IF dtel_has_built_in_type = abap_true.
    DATA(dtel_built_in_type) = dtel_content->get_underlying_built_in_type( ).
    DATA(dtel_built_in_type_length) = dtel_built_in_type->length.
    DATA(dtel_buift_in_type_type) = dtel_built_in_type->type.
    DATA(dtel_type_descriptor) = dtel_built_in_type->abap_type->get_type_descriptor( ).
    DATA(dtel_built_in_type_abs_name) = dtel_built_in_type->abap_type->get_type_descriptor( )->absolute_name.
    DATA(dtel_built_in_type_kind) = dtel_built_in_type->abap_type->get_type_descriptor( )->kind.
  ENDIF.

  "Domain information
  IF dtel_type_is_domain = abap_true.
    DATA(dtel_domain) = dtel_content->get_data_type( )->get_domain( ).
    IF dtel_domain IS NOT INITIAL.
      DATA(dtel_domain_name) = dtel_domain->name.
      DATA(dtel_domain_content) = dtel_domain->content( ).
      DATA(dtel_domain_is_built_in_type) = dtel_domain_content->get_format( )->is_built_in_type( ).
      IF dtel_domain_is_built_in_type = abap_true.
        DATA(dtel_domain_built_in_type) = dtel_domain_content->get_format( )->get_built_in_type( ).
      ENDIF.
      DATA(dtel_domain_output_ch) = dtel_domain_content->get_output_characteristics( ).
      DATA(dtel_domain_description) = dtel_domain_content->get_short_description( ).
      DATA(dtel_domain_fixed_values) = dtel_domain->fixed_values->all->get( ).
      DATA(dtel_domain_fixed_lower_limits) = dtel_domain->fixed_values->all->get_lower_limits( ).
    ENDIF.
    "Release state and visibilities
    DATA(dtel_release_state) = dtel->get_api_state( )->get_release_state( )->value.
    DATA(dtel_visibilities) = dtel->get_api_state( )->get_visibilities( ).

    "Retrieving further information via interfaces
    DATA(dtel_namespace) = dtel->if_xco_ar_object~get_namespace( ).
    DATA(dtel_orig_lang) = dtel->if_xco_ar_object~get_original_language( )->value.
    DATA(dtel_package) = dtel->if_xco_ar_object~get_package( )->name.
    DATA(dtel_cts_obj) = dtel->if_xco_cts_changeable~get_object( )->name.
    DATA(dtel_cts_obj_is_locked) = dtel->if_xco_cts_changeable~get_object( )->is_locked( ).
    IF dtel_cts_obj_is_locked = abap_true.
      DATA(dtel_tr) = dtel->if_xco_cts_changeable~get_object( )->get_lock( )->get_transport( ).
    ENDIF.
    DATA(dtel_obj_type) = dtel->if_xco_cts_changeable~get_object( )->type.
    DATA(dtel_cts_obj_prog_id) = dtel->if_xco_cts_changeable~get_object( )->program_id->value.
  ENDIF.
ELSE.
  "Data element does not exist
ENDIF.

*&---------------------------------------------------------------------*
*& Table type
*&---------------------------------------------------------------------*

DATA(table_type) = xco_cp_abap_dictionary=>table_type( 'ABP_BEHV_RESPONSE_TAB' ).
IF table_type->exists( ).
  DATA(table_type_name) = table_type->name.
  DATA(table_type_syntax_check_msg) = table_type->check_syntax( )->messages.
  "Handle for header content of table type
  DATA(table_type_content) = table_type->content( ).
  DATA(table_type_access) = table_type_content->get_access( )->value.
  "Key information
  DATA(table_type_primary_key) = table_type_content->get_primary_key( ).
  DATA(table_type_key_category) = table_type_primary_key->key_category->value.
  DATA(table_type_key_components) = table_type_primary_key->key_components.
  DATA(table_type_key_definition) = table_type_primary_key->key_definition->value.
  DATA(table_type_secondary_keys) = table_type_content->get_secondary_keys( ).
  DATA(table_type_description) = table_type_content->get_short_description( ).
  "Row type information
  DATA(table_type_row_type) = table_type_content->get_row_type( ).
  DATA(table_type_structure) = table_type_row_type->get_structure( ).
  DATA(table_type_struct_name) = table_type_structure->name.
  DATA(table_type_struct_comp_names) = table_type_structure->components->all->get_names( ).
  DATA(table_type_struct_comps) = table_type_structure->components->all->get( ).
  DATA(table_type_content_get_alt) = table_type_content->get( ).
  DATA(table_type_pr_key_alt) = table_type_content_get_alt-primary_key->key_components.
  DATA(table_type_sec_key_alt) = table_type_content_get_alt-secondary_keys.
  "Release state and visibilities
  DATA(table_type_release_state) = table_type->get_api_state( )->get_release_state( )->value.
  DATA(table_type_visibilities) = table_type->get_api_state( )->get_visibilities( ).

  "Retrieving further information via interfaces
  DATA(table_type_namespace) = table_type->if_xco_ar_object~get_namespace( ).
  DATA(table_type_orig_lang) = table_type->if_xco_ar_object~get_original_language( )->value.
  DATA(table_type_package) = table_type->if_xco_ar_object~get_package( )->name.
  DATA(table_type_cts_obj) = table_type->if_xco_cts_changeable~get_object( )->name.
  DATA(table_type_cts_obj_is_locked) = table_type->if_xco_cts_changeable~get_object( )->is_locked( ).
  IF table_type_cts_obj_is_locked = abap_true.
    DATA(table_type_tr) = table_type->if_xco_cts_changeable~get_object( )->get_lock( )->get_transport( ).
  ENDIF.
  DATA(table_type_obj_type) = table_type->if_xco_cts_changeable~get_object( )->type.
  DATA(table_type_cts_obj_prog_id) = table_type->if_xco_cts_changeable~get_object( )->program_id->value.

ELSE.
  "Table type does not exist
ENDIF.

*&---------------------------------------------------------------------*
*& CDS view entity
*&---------------------------------------------------------------------*

DATA(cds_ve) = xco_cp_cds=>view_entity( 'ZDEMO_ABAP_RAP_RO_M' ).
IF cds_ve->exists( ).
  DATA(cds_ve_name) = cds_ve->name.
  DATA(cds_ve_assoc) = cds_ve->associations.
  DATA(cds_ve_comp) = cds_ve->compositions.
  DATA(cds_ve_flds) = cds_ve->fields.
  DATA(cds_ve_param) = cds_ve->parameters.

  "Association information
  DATA(cds_ve_associations) = cds_ve->associations->all->get( ).
  LOOP AT cds_ve_associations INTO DATA(assoc).
    DATA(assoc_entity) = assoc->entity.
    DATA(assoc_name) = assoc->name.
    DATA(assoc_content) = assoc->content( ).
    DATA(assoc_content_struc) = assoc_content->get( ).
    "Accessing (selected) information via the resulting structure of the get method
    DATA(assoc_alias_1) = assoc_content_struc-alias.
    DATA(assoc_target_1) = assoc_content_struc-target.
    "Accessing (selected) information via dedicated methods
    DATA(assoc_alias_2) = assoc->content( )->get_alias( ).
    DATA(assoc_cardinality) = assoc->content( )->get_cardinality( ).
    DATA(assoc_condition) = assoc->content( )->get_condition( ).
    DATA(assoc_target_2) = assoc->content( )->get_target( ).
    DATA(assoc_parent_indicator) = assoc->content( )->get_to_parent_indicator( ).
    DATA(assoc_association) = assoc->content( )->association.
  ENDLOOP.

  "Composition information
  DATA(cds_ve_compositions) = cds_ve->compositions->all->get( ).
  LOOP AT cds_ve_compositions INTO DATA(comp).
    DATA(comp_entity) = comp->entity.
    DATA(comp_target) = comp->target.
    DATA(comp_content) = comp->content( ).
    DATA(comp_content_struc) = comp_content->get( ).
    "Accessing (selected) information via the resulting structure of the get method
    DATA(comp_alias_1) = comp_content_struc-alias.
    DATA(comp_cardinality_1) = comp_content_struc-cardinality.
    "Accessing (selected) information via dedicated methods
    DATA(comp_alias_2) = comp->content( )->get_alias( ).
    DATA(comp_cardinality_2) = comp->content( )->get_cardinality( ).
    DATA(comp_composition) = comp->content( )->composition.
  ENDLOOP.

  "Field information
  DATA(cds_ve_field_names) = cds_ve->fields->all->get_names( ).
  DATA(cds_ve_fields) = cds_ve->fields->all->get( ).
  LOOP AT cds_ve_fields INTO DATA(ve_field).
    DATA(cds_ve_f_content) = ve_field->content( ).
    "Accessing (selected) information via the resulting structure of the get method
    DATA(cds_ve_f_content_struc) = ve_field->content( )->get( ).
    DATA(cds_ve_f_alias_1) =  cds_ve_f_content_struc-alias.
    DATA(cds_ve_f_assoc_1) =  cds_ve_f_content_struc-association.
    DATA(cds_ve_f_key_indicator_1) =  cds_ve_f_content_struc-key_indicator.
    "Accessing (selected) information via dedicated methods
    DATA(cds_ve_f_alias_2) = cds_ve_f_content->get_alias( ).
    DATA(cds_ve_f_assoc_2) = cds_ve_f_content->get_association( ).
    DATA(cds_ve_f_key_indicator_2) = cds_ve_f_content->get_key_indicator( ).
    DATA(cds_ve_f_comp) = cds_ve_f_content->get_composition( ).
    DATA(cds_ve_f_expr) = cds_ve_f_content->get_expression( ).
    DATA(cds_ve_f_redirected) = cds_ve_f_content->get_redirected_to( ).
    DATA(cds_ve_f_redirected_ch) = cds_ve_f_content->get_redirected_to_compos_child( ).
    DATA(cds_ve_f_redirected_par) = cds_ve_f_content->get_redirected_to_parent( ).
    DATA(cds_ve_f_virutal_indicator) = cds_ve_f_content->get_virtual_indicator( ).
  ENDLOOP.

  "Parameter information
  DATA(cds_ve_param_names) = cds_ve->parameters->all->get_names( ).
  DATA(cds_ve_params) = cds_ve->parameters->all->get( ).
  LOOP AT cds_ve_params INTO DATA(ve_param).
    DATA(param_name) = ve_param->name.
    DATA(param_entity) = ve_param->entity.
    DATA(param_content) = ve_param->content( ).
    "Accessing (selected) information via the resulting structure of the get method
    DATA(param_content_struc) = ve_param->content( )->get( ).
    DATA(param_dtype_1) =  param_content_struc-data_type.
    DATA(param_orig_name_1) = param_content_struc-original_name.
    "Accessing (selected) information via dedicated methods
    DATA(param_dtype_2) = param_content->get_data_type( ).
    DATA(param_orig_name_2) = param_content->get_original_name( ).
  ENDLOOP.

  "Retrieving further information via interfaces
  DATA(cds_ve_namespace) = cds_ve->if_xco_ar_object~get_namespace( ).
  DATA(cds_ve_orig_lang) = cds_ve->if_xco_ar_object~get_original_language( )->value.
  DATA(cds_ve_package) = cds_ve->if_xco_ar_object~get_package( )->name.
  DATA(cds_ve_cts_obj) = cds_ve->if_xco_cts_changeable~get_object( )->name.
  DATA(cds_ve_cts_obj_is_locked) = cds_ve->if_xco_cts_changeable~get_object( )->is_locked( ).
  IF cds_ve_cts_obj_is_locked = abap_true.
    DATA(cds_ve_tr) = cds_ve->if_xco_cts_changeable~get_object( )->get_lock( )->get_transport( ).
  ENDIF.
  DATA(cds_ve_obj_type) = cds_ve->if_xco_cts_changeable~get_object( )->type.
  DATA(cds_ve_cts_obj_prog_id) = cds_ve->if_xco_cts_changeable~get_object( )->program_id->value.

ELSE.
  "CDS view entity does not exist
ENDIF.

*&---------------------------------------------------------------------*
*& Class
*&---------------------------------------------------------------------*

DATA(cl) = xco_cp_abap=>class( 'CL_ABAP_TYPEDESCR' ).
IF cl->exists( ).
  DATA(cl_name) = cl->name.
  DATA(cl_syntax_check_msg) = cl->check_syntax( )->messages.
  "Creation and change information
  DATA(cl_created_by) = cl->get_created_by( ).
  DATA(cl_created_on) = cl->get_created_on( ).
  DATA(cl_last_changed_by) = cl->get_last_changed_by( ).
  DATA(cl_last_changed_on) = cl->get_last_changed_on( ).
  "Subclasses
  DATA(cl_subclasses) = cl->subclasses->all->get_names( ).
  DATA(cl_subcl) = cl->subclasses->all->get( ).
  LOOP AT cl_subcl INTO DATA(sub).
    DATA(sub_name) = sub->name.
    DATA(sub_name_content) = sub->content( ).
  ENDLOOP.

  "Information on the definition part
  DATA(cl_definition) = cl->definition->content( ).
  DATA(cl_definition_get) = cl_definition->get( ).
  DATA(cl_final) = cl_definition->get_final_indicator( ).
  DATA(cl_abstract) = cl_definition->get_abstract_indicator( ).
  DATA(cl_friends) = cl_definition->get_global_friends( ).
  DATA(cl_interfaces) = cl_definition->get_interfaces( ).
  DATA(cl_definition_visibility) = cl_definition->get_visibility( )->value.
  "Superclass
  DATA(cl_superclass) = cl_definition->get_superclass( ).
  IF cl_superclass IS NOT INITIAL.
    DATA(cl_superclass_name) = cl_superclass->name.
    DATA(cl_superclass_content) = cl_superclass->content( ).
  ENDIF.
  "Associated behavior definition
  DATA(cl_for_behv) = cl_definition->get_for_behavior_of( ).
  IF cl_for_behv IS NOT INITIAL.
    DATA(cl_for_behv_name) = cl_for_behv->name.
    DATA(cl_for_behv_content) = cl_for_behv->content( ).
  ENDIF.
  "Information on components in the visibility sections
  DATA(cl_private_components) = cl->definition->section-private->components.
  DATA(cl_protected_components) = cl->definition->section-protected->components.
  DATA(cl_public_components) = cl->definition->section-public->components.
  "Component information
  DATA(cl_all_public_inst_methods) = cl_public_components->method->all->get( ).
  DATA(cl_all_public_stat_methods) = cl_public_components->class_method->all->get( ).
  DATA(cl_all_public_inst_attr) = cl_public_components->data->all->get( ).
  DATA(cl_all_public_static_attr) = cl_public_components->class_data->all->get( ).
  DATA(cl_all_public_constants) = cl_public_components->constant->all->get( ).
  DATA(cl_all_public_alias_comps) = cl_public_components->alias->all->get( ).
  "More detailed information on components (the examples use static methods of the class)
  LOOP AT cl_all_public_stat_methods INTO DATA(stat_meth).
    DATA(meth_name) = stat_meth->name.
    "Parameter information
    DATA(meth_importing_params) = stat_meth->importing_parameters->all->get( ).
    LOOP AT meth_importing_params INTO DATA(import).
      DATA(import_param_name) = import->name.
      DATA(import_param_content) = import->content( )->get( ).
    ENDLOOP.

    DATA(meth_exporting_params) = stat_meth->exporting_parameters->all->get( ).
    DATA(meth_changing_params) = stat_meth->changing_parameters->all->get( ).
    DATA(meth_returning_params) = stat_meth->returning_parameters->all->get( ).
    DATA(meth_exceptions) = stat_meth->exceptions->all->get( ).
    DATA(meth_all_param_names) = stat_meth->parameters->all->get_names( ).

    DATA(meth_get) = stat_meth->content( )->get( ).
    DATA(meth_abstract) = stat_meth->content( )->get_abstract_indicator( ).
    DATA(meth_amdp) = stat_meth->content( )->get_amdp( ).
    DATA(meth_final) = stat_meth->content( )->get_final_indicator( ).
    DATA(meth_redefinition) = stat_meth->content( )->get_redefinition_indicator( ).
    DATA(meth_description) = stat_meth->content( )->get_short_description( ).

    "Source code of the method implementation
    DATA(meth_implementation) = cl->implementation->method( meth_name )->content( )->get( )-source.
  ENDLOOP.

  "Retrieving further information via interfaces
  DATA(cl_namespace) = cl->if_xco_ar_object~get_namespace( ).
  DATA(cl_orig_lang) = cl->if_xco_ar_object~get_original_language( )->value.
  DATA(cl_package) = cl->if_xco_ar_object~get_package( )->name.
  DATA(cl_cts_obj) = cl->if_xco_cts_changeable~get_object( )->name.
  DATA(cl_cts_obj_is_locked) = cl->if_xco_cts_changeable~get_object( )->is_locked( ).
  IF cl_cts_obj_is_locked = abap_true.
    DATA(cl_tr) = cl->if_xco_cts_changeable~get_object( )->get_lock( )->get_transport( ).
  ENDIF.
  DATA(cl_obj_type) = cl->if_xco_cts_changeable~get_object( )->type.
  DATA(cl_cts_obj_prog_id) = cl->if_xco_cts_changeable~get_object( )->program_id->value.

ELSE.
  "Class does not exist
ENDIF.

*&---------------------------------------------------------------------*
*& Interface
*&---------------------------------------------------------------------*

DATA(intf) = xco_cp_abap=>interface( 'ZDEMO_ABAP_OBJECTS_INTERFACE' ).
IF intf->exists( ).
  DATA(intf_name) = intf->name.
  DATA(intf_syntax_check_msg) = intf->check_syntax( )->messages.
  "Creation and change information
  DATA(intf_created_by) = intf->get_created_by( ).
  DATA(intf_created_on) = intf->get_created_on( ).
  DATA(intf_last_changed_by) = intf->get_last_changed_by( ).
  DATA(intf_last_changed_on) = intf->get_last_changed_on( ).
  "Interface content information
  DATA(intf_get) = intf->content( )->get( ).
  DATA(intf_description) = intf->content( )->get_short_description( ).
  "Component information
  DATA(intf_components) = intf->components.
  "Getting information about where the interface is implemented
  DATA(intf_implementations_get) = intf->implementations->all->get( ).
  DATA(intf_implementations_names) = intf->implementations->all->get_names( ).
  "Note that methods are available as shown for classes
  DATA(intf_static_meths) = intf->components->class_method->all->get( ).

  "Retrieving further information via interfaces
  DATA(intf_namespace) = intf->if_xco_ar_object~get_namespace( ).
  DATA(intf_orig_lang) = intf->if_xco_ar_object~get_original_language( )->value.
  DATA(intf_package) = intf->if_xco_ar_object~get_package( )->name.
  DATA(intf_cts_obj) = intf->if_xco_cts_changeable~get_object( )->name.
  DATA(intf_cts_obj_is_locked) = intf->if_xco_cts_changeable~get_object( )->is_locked( ).
  IF intf_cts_obj_is_locked = abap_true.
    DATA(intf_tr) = intf->if_xco_cts_changeable~get_object( )->get_lock( )->get_transport( ).
  ENDIF.
  DATA(intf_obj_type) = intf->if_xco_cts_changeable~get_object( )->type.
  DATA(intf_cts_obj_prog_id) = intf->if_xco_cts_changeable~get_object( )->program_id->value.

ELSE.
  "Interface does not exist
ENDIF.
``` 

</td>
</tr>
</table>

<p align="right"><a href="#top">⬆️ back to top</a></p>

## Generating ABAP Repository Objects

<table>
<tr>
<td> Class </td> <td> Details/Code Snippet </td>
</tr>
<tr>
<td> <code>XCO_CP_GENERATION</code> </td>
<td>
For creating, updating and deleting ABAP repository objects. More information: <a href="https://help.sap.com/docs/btp/sap-business-technology-platform/generation-apis">Generation APIs</a><br>The rudimentary snippet is taken from the executable example of the ABAP for Cloud Development cheat sheet.

<br><br>

``` abap
...
DATA(n10_handler) = xco_cp_generation=>environment->dev_system( ... ).
DATA(n11_put) = n10_handler->create_put_operation( ).

"Creating a domain
DATA(n12_doma_spec) = n11_put->for-doma->add_object( ... "e.g. 'ZDEMO_ABAP_STATUS'
  )->set_package( ...
  )->create_form_specification( ).
n12_doma_spec->set_short_description( 'Demo domain' ).
n12_doma_spec->set_format( xco_cp_abap_dictionary=>built_in_type->char( 10 ) ).
n12_doma_spec->fixed_values->add_fixed_value( 'BOOKED'
  )->set_description( 'Booked' ).
n12_doma_spec->fixed_values->add_fixed_value( 'CANCELED'
  )->set_description( 'Canceled' ).

...

"Executing the generation
TRY.
    n11_put->execute( ).      
  CATCH cx_xco_gen_put_exception.
ENDTRY.
``` 

</td>
</tr>
</table>

<p align="right"><a href="#top">⬆️ back to top</a></p>
