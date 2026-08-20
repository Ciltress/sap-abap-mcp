# Internal tables, structures and dynamic programming

One topic from the *Released ABAP Classes* cheat sheet; the rest are listed in this skill's SKILL.md.
A class appearing here is not proof it exists on your system - release state is per system and per
release. `readAbapObject` returning the object is the proof.

## Contents

- Assignments
- Information about Non-Initial Structure Components
- Comparing Content of Compatible Internal Tables
- Dynamic Programming

---

## Assignments

<table>
<tr>
<td> Class </td> <td> Details/Code Snippet </td>
</tr>
<tr>
<td> <code>CL_ABAP_CORRESPONDING</code> </td>
<td>

For assignments of components between structures or between internal tables with dynamically specified mapping rules. For more information, you can refer to the <a href="https://help.sap.com/doc/abapdocu_cp_index_htm/CLOUD/en-US/index.htm?file=abencl_abap_corresponding.htm">ABAP Keyword Documentation</a>.
The example shows simple assignments with structures.
<br><br>

``` abap
DATA: BEGIN OF s1,
        a TYPE i,
        b TYPE c LENGTH 3,
        c TYPE c LENGTH 5,
      END OF s1.

DATA: BEGIN OF s2,
        a TYPE i,
        b TYPE c LENGTH 3,
        d TYPE string,
      END OF s2.

"Populating structures
s1 = VALUE #( a = 1 b = 'aaa' c = 'bbbbb' ).
s2 = VALUE #( a = 2 b = 'ccc' d = `dddd` ).
DATA(s3) = s1.
DATA(s4) = s2.

"Creating a mapping object
"An initial mapping table means that only identically named components are assigned.
"Other components retain their original values, i.e. the assignment for structures
"works like MOVE-CORRESPONDING or the CORRESPONDING operator with the BASE addition
DATA(map_obj) = cl_abap_corresponding=>create( source  = s1
                                               destination = s2
                                               mapping  = VALUE #( ) ).

"Performing the assignment
map_obj->execute( EXPORTING source      = s1
                  CHANGING  destination = s2 ).

*s2
*A    B      D
*1    aaa    dddd

"Performing the assignment without extra variable; specifying the mapping table:
"level: 0 means the top level
"kind: 1 means that components specified in this line are mapped to each other;
"      see the specification options in cl_abap_corresponding=>mapping_...
"srcname/dstname: source component/target component

cl_abap_corresponding=>create(
    source  = s3
    destination = s4
    mapping  = VALUE #( ( level = 0 kind = 1 srcname = 'c' dstname = 'd' ) )
  )->execute( EXPORTING source      = s3
              CHANGING  destination = s4 ).

*s4
*A    B      D
*1    aaa    bbbbb
``` 

</td>
</tr>
</table>

<p align="right"><a href="#top">⬆️ back to top</a></p>

## Information about Non-Initial Structure Components

<table>
<tr>
<td> Class </td> <td> Details/Code Snippet </td>
</tr>
<tr>
<td> <code>CL_ABAP_STRUCT_UTILITIES</code> </td>
<td>
Provides methods to get information about filled components in structures allowing an efficient processing of non-initial components of a structure.
<br><br>

``` abap
CLASS zcl_demo_abap DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC .

  PUBLIC SECTION.
    INTERFACES if_oo_adt_classrun.
  PRIVATE SECTION.
ENDCLASS.

CLASS zcl_demo_abap IMPLEMENTATION.
  METHOD if_oo_adt_classrun~main.
    out->write( `---------- filled_components method ----------` ).
    "It returns an internal table containing the names of the non-initial
    "components of the structure and their index.
    DATA: BEGIN OF struct,
            a TYPE c LENGTH 1,
            b TYPE i,
            c TYPE zdemo_abap_carr,
            d TYPE REF TO string,
          END OF struct.

    struct = VALUE #( a = 'X'
                      b = 123
                      c = VALUE #( carrid = 'LH' )
                      d = NEW #( `ABAP` ) ).

    "Getting component information using RTTI
    DATA(all_comps) = CAST cl_abap_structdescr(  cl_abap_typedescr=>describe_by_data( struct ) )->components.
    out->write( all_comps ).

    "Getting an internal table containing the names of non-initial components
    "and their index
    DATA(filled_comps) = cl_abap_struct_utilities=>filled_components( struct ).
    out->write( filled_comps ).

    "In a loop, structure components are cleared. The filled_components method
    "is called in each loop pass, visualizing the filled components in the
    "structure.
    DO lines( all_comps ) TIMES.
      CLEAR struct-(sy-index).
      filled_comps = cl_abap_struct_utilities=>filled_components( struct ).
      out->write( filled_comps ).
    ENDDO.

    out->write( `---------- filled_components_c method ----------` ).
    "Same as above. All structure components must be typed with c LENGTH 1.
    DATA: BEGIN OF struct_c1,
            a TYPE c LENGTH 1 VALUE 'X',
            b TYPE c LENGTH 1,
            c TYPE c LENGTH 1 VALUE 'X',
          END OF struct_c1.

    filled_comps = cl_abap_struct_utilities=>filled_components_c( struct_c1 ).
    out->write( filled_comps ).

    out->write( `---------- filled_components_x method ----------` ).
    "Same as above. All structure components must be typed with x LENGTH 1.
    "It is especially useful for checking filled components of BDEF derived types,
    "for example, %control.
    DATA struc_der_type TYPE STRUCTURE FOR READ IMPORT zdemo_abap_rap_ro_m.
    struc_der_type = VALUE #( %control = VALUE #( key_field = if_abap_behv=>mk-on
                                                  field1    = if_abap_behv=>mk-on
                                                  field2    = if_abap_behv=>mk-off
                                                  field3    = if_abap_behv=>mk-off
                                                  field4    = if_abap_behv=>mk-on ) ).

    filled_comps = cl_abap_struct_utilities=>filled_components_x( struc_der_type-%control ).
    out->write( filled_comps ).
  ENDMETHOD.
ENDCLASS.
``` 

</td>
</tr>
</table>

<p align="right"><a href="#top">⬆️ back to top</a></p>

## Comparing Content of Compatible Internal Tables

<table>
<tr>
<td> Class </td> <td> Details/Code Snippet </td>
</tr>
<tr>
<td> <code>CL_ABAP_DIFF</code> </td>
<td>
Using the methods <code>diff</code> and <code>diff_with_line_ref</code> of the <code>CL_ABAP_DIFF</code> class, you can compare the content of two compatible index tables. The returning parameter is an internal table showing how the content of one internal table can be modified to match another one. <code>diff_with_line_ref</code> also returns a reference to the original table lines. Various importing parameters are available to adjust the comparison. Find more information in the class documentation and in the <a href="https://help.sap.com/doc/abapdocu_cp_index_htm/CLOUD/en-US/index.htm?file=abencl_abap_diff.htm">ABAP Keyword Documentation</a>.

<br>

```abap
CLASS zcl_demo_test DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC .

  PUBLIC SECTION.
    INTERFACES if_oo_adt_classrun.
  PROTECTED SECTION.
  PRIVATE SECTION.
ENDCLASS.



CLASS zcl_demo_test IMPLEMENTATION.
  METHOD if_oo_adt_classrun~main.
    TYPES: BEGIN OF s,
             a TYPE i,
             b TYPE string,
             c TYPE c LENGTH 3,
           END OF s.

    DATA it1 TYPE TABLE OF s WITH EMPTY KEY.
    DATA it2 TYPE TABLE OF s WITH EMPTY KEY.

    it1 = VALUE #(
    ( a = 1 b = `aaa` c = 'zzz' )
    ( a = 2 b = `bbb` c = 'yyy' )
    ( a = 3 b = `ccc` c = 'xxx' )
    ( a = 4 b = `ddd` c = 'www' )
    ).

    it2 = VALUE #(
    ( a = 1 b = `aaa` c = 'zzz' )
    ( a = 2 b = `#bb` c = 'yy#' )
    ( a = 3 b = `cc` c = 'x' )
    ( a = 4 b = `ddd` c = 'www' )
    ( a = 5 b = `eee` c = 'vvv' )
    ).

    DATA(it3) = it1.
    DATA is_identical TYPE abap_bool.

    DATA(comparison) = cl_abap_diff=>create(  ).
    TRY.
        DATA(comp_res1) = comparison->diff( EXPORTING target = it2
                                                      source = it1
                                            IMPORTING flag_identical = is_identical ).
        IF is_identical = abap_true.
          out->write( `The two internal tables have identical content.` ).          
        ELSE.
          out->write( comp_res1 ).
        ENDIF.
      CATCH cx_abap_diff INTO DATA(error1).
        out->write( error1->get_text( ) ).
    ENDTRY.

    TRY.
        DATA(comp_res2) = comparison->diff_with_line_ref( EXPORTING target = it2
                                                                    source = it1
                                                          IMPORTING flag_identical = is_identical ).
        IF is_identical = abap_true.
          out->write( `The two internal tables have identical content.` ).          
        ELSE.
          out->write( comp_res2 ).
        ENDIF.
      CATCH cx_abap_diff INTO DATA(error2).
        out->write( error2->get_text( ) ).
    ENDTRY.

    TRY.
        DATA(comp_res3) = comparison->diff_with_line_ref( EXPORTING target = it3
                                                                    source = it1
                                                          IMPORTING flag_identical = is_identical ).
        IF is_identical = abap_true.
          out->write( `The two internal tables have identical content.` ).          
        ELSE.
          out->write( comp_res3 ).
        ENDIF.
      CATCH cx_abap_diff INTO DATA(error3).
        out->write( error3->get_text( ) ).
    ENDTRY.
  ENDMETHOD.
ENDCLASS.
```

</td>
</tr>
</table>

<p align="right"><a href="#top">⬆️ back to top</a></p>

## Dynamic Programming

<table>
<tr>
<td> Class </td> <td> Details/Code Snippet </td>
</tr>
<tr>
<td> <code>CL_ABAP_DYN_PRG</code> </td>
<td>
For validating input for dynamic specifications. 
<br><br>

``` abap
"The following method checks database table names. The name is provided
"with the val parameter. The packages formal parameter expects a table
"containing the names of packages in which the specified table should be
"included. Assuming you provide incorrect input for the table name, or
"the table is not contained in the specified packages, you can expect an
"exception to be raised.
TRY.
    DATA(dbtab) = cl_abap_dyn_prg=>check_table_name_tab(
      val      = `ZDEMO_ABAP_FLI`
      packages = VALUE #( ( `TEST_ABAP_CHEAT_SHEETS` )
                          ( `TEST_SOME_PACK` ) ) ).

    SELECT SINGLE * FROM (dbtab) INTO NEW @DATA(ref_wa).
  CATCH cx_abap_not_a_table cx_abap_not_in_package.
    ...
ENDTRY.

"In the following examples, a method is used to check whether
"the input is allowed or not. For this, you specify an allowlist.
"Here, the relvant parameter expects a comma-separated list of
"allowed values.
TRY.
    DATA(value1) = cl_abap_dyn_prg=>check_allowlist(
        val           = `A`
        allowlist_str = `A,B,C,D` ).

    ... "Here might go an ABAP SQL statement with a dynamic specification.
  CATCH cx_abap_not_in_allowlist.
    ...
ENDTRY.

"Another parameter of the method expects an internal table that
"contains the allowed values.
TRY.
    DATA(value2) = cl_abap_dyn_prg=>check_allowlist(
        val            = `XYZ`
        allowlist_htab = VALUE #( ( `A` )
                                  ( `B` )
                                  ( `C` )
                                  ( `D` ) ) ).

    ... "Here might go an ABAP SQL statement with a dynamic specification.
  CATCH cx_abap_not_in_allowlist.
    ...
ENDTRY.
``` 

</td>
</tr>
</table>

<p align="right"><a href="#top">⬆️ back to top</a></p>
